import { DurableObject } from "cloudflare:workers";
import { Api, helpers, TelegramClient, WebSocketTransport } from "teleproto";
import { Logger } from "teleproto/extensions";
import { LogLevel } from "teleproto/extensions/Logger";
import { StringSession } from "teleproto/sessions";
import { z } from "zod";
import { telegramJob } from "../app/server/canva-telegram.server";
import type { HubbyEnv } from "../app/server/runtime-context.server";
import { openStockUnit } from "../app/server/stock-seal.server";

const configSchema = z.object({
  apiId: z.number().int().positive(), apiHash: z.string().regex(/^[0-9a-f]{32}$/i),
  session: z.string().min(100).max(2000), userId: z.string().regex(/^\d+$/),
  botId: z.string().regex(/^\d+$/), botAccessHash: z.string().regex(/^-?\d+$/),
});
const workSchema = z.object({
  jobId: z.uuid(), sourceId: z.string().regex(/^\d+$/), telegramOrderId: z.string().regex(/^\d+$/),
  randomId: z.string().regex(/^-?\d+$/), requestId: z.uuid(),
  payload: z.object({ciphertext: z.string(), nonce: z.string(), key_version: z.number()}),
});
// One named object serializes the supplier conversation. No purchase method exists here.
export class CanvaTelegram extends DurableObject<HubbyEnv> {
  private running = false;
  async fetch(request: Request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/run") return new Response(null,{status:404});
    if (this.running) return Response.json({outcome:"busy"});
    if (!this.env.TELEGRAM_CONFIG || !this.env.INVENTORY_ENCRYPTION_KEY_V1) return Response.json({outcome:"unconfigured"});
    this.running = true;
    let client: TelegramClient | undefined;
    let jobId: string | undefined;
    let submitted = false;
    try {
      // An interrupted send blocks the entire conversation; do not guess or resend.
      if (await this.ctx.storage.get("blocked")) return Response.json({outcome:"attention"});
      const config = configSchema.parse(JSON.parse(this.env.TELEGRAM_CONFIG));
      const raw = await telegramJob(this.env,{p_action:"claim"});
      if (!raw) return Response.json({outcome:"idle"});
      const work = workSchema.parse(raw);
      jobId = work.jobId;
      await this.ctx.storage.put("blocked",jobId);
      const activation = await openStockUnit({id:work.requestId,variantId:work.requestId},work.payload,{1:this.env.INVENTORY_ENCRYPTION_KEY_V1});
      if (activation.type!=="raw_text") throw new Error("delivery_uncertain");
      const {email} = z.object({purpose:z.literal("canva_activation"),email:z.email().max(254)}).parse(JSON.parse(activation.text));
      client = new TelegramClient(new StringSession(config.session),config.apiId,config.apiHash,{
        transport:new WebSocketTransport(),baseLogger:new Logger(LogLevel.NONE),
        connectionRetries:1,reconnectRetries:0,requestRetries:0,autoReconnect:false,
        floodSleepThreshold:0,timeout:15,catchUp:false,deviceModel:"Hubby Cloudflare",
      });
      await client.connect();
      const me = await client.getMe();
      if (me.id.toString()!==config.userId) throw new Error("account_mismatch");
      const peer = new Api.InputPeerUser({userId:helpers.returnBigInt(config.botId),accessHash:helpers.returnBigInt(config.botAccessHash)});
      const bot = await client.getEntity(peer);
      if (!(bot instanceof Api.User) || !bot.bot || bot.id.toString()!==config.botId) throw new Error("account_mismatch");
      let history = await client.getMessages(peer,{limit:60});
      // Only navigate a READ-only View button for the exact confirmed Telegram order.
      const target = work.telegramOrderId;
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const viewPattern = new RegExp(`^\\s*[^A-Za-z0-9]*View\\s+#${escaped}\\s*$`,"i");
      const buttonMessage = history.find(m=>m.replyMarkup instanceof Api.ReplyInlineMarkup && m.replyMarkup.rows.some(r=>r.buttons.some(b=>b instanceof Api.KeyboardInlineButton && b.type instanceof Api.InlineButtonTypeCallback && viewPattern.test(b.text))));
      if (buttonMessage?.replyMarkup instanceof Api.ReplyInlineMarkup) {
        const button = buttonMessage.replyMarkup.rows.flatMap(r=>r.buttons).find(b=>b instanceof Api.KeyboardInlineButton && b.type instanceof Api.InlineButtonTypeCallback && viewPattern.test(b.text));
        if (button instanceof Api.KeyboardInlineButton && button.type instanceof Api.InlineButtonTypeCallback) {
          await client.invoke(new Api.messages.GetBotCallbackAnswer({peer,msgId:buttonMessage.id,data:button.type.data}));
          history = await client.getMessages(peer,{limit:30});
        }
      }
      const orderPattern = new RegExp(`\\bOrder\\s*#${escaped}\\b`,"i");
      const order = history.find(m=>!m.out && orderPattern.test(m.message ?? ""));
      if (!order) throw new Error("bot_order_not_found");
      // The selected order itself must explicitly be waiting for account details.
      if (!/waiting[\s\S]{0,100}(?:account details|email)|send[\s\S]{0,50}(?:account details|email)/i.test(order.message ?? "")) throw new Error("bot_prompt_unverified");
      // No other newer order may have taken over the bot's conversational state.
      if (history.some(m=>m.id>order.id && /\bOrder\s*#\d+\b/i.test(m.message ?? "") && !orderPattern.test(m.message ?? ""))) throw new Error("bot_prompt_unverified");
      submitted = true;
      const result = await client.invoke(new Api.messages.SendMessage({
        peer,message:email,randomId:helpers.returnBigInt(work.randomId),
        replyTo:new Api.InputReplyToMessage({replyToMsgId:order.id}),
        noWebpage:true,
      }));
      const updates = "updates" in result ? result.updates : [];
      const matchingUpdate = updates.find((u): u is Api.UpdateMessageID => u instanceof Api.UpdateMessageID && u.randomId?.toString()===work.randomId);
      const messageId = "id" in result ? result.id : matchingUpdate?.id;
      if (!messageId || typeof messageId!=="number") throw new Error("delivery_uncertain");
      const saved = await telegramJob(this.env,{p_action:"finish",p_job:jobId,p_message:messageId});
      if (saved!==true) throw new Error("delivery_uncertain");
      await this.ctx.storage.delete("blocked");
      return Response.json({outcome:"sent",jobId});
    } catch(error) {
      const allowed = ["bot_order_not_found","bot_prompt_unverified","account_mismatch"];
      const issue = error instanceof Error && allowed.includes(error.message) ? error.message : submitted ? "delivery_uncertain" : "telegram_unavailable";
      if (jobId) await telegramJob(this.env,{p_action:"finish",p_job:jobId,p_issue:issue}).catch(()=>undefined);
      return Response.json({outcome:"attention",issue});
    } finally {
      await client?.destroy().catch(()=>undefined);
      this.running = false;
    }
  }
}
