import { Form, Link, useActionData, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { fetchBiteOrder } from "../server/bite-api.server";
import { telegramJob, telegramRows, wakeCanvaTelegram } from "../server/canva-telegram.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { runtimeContext } from "../server/runtime-context.server";
import { requireOwner } from "../server/supabase.server";

export { ErrorBoundary } from "./admin";
export function meta(){return [{title:"Gửi email Canva qua Telegram — Hubby"}];}
export function headers(){return {"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};}
export async function loader({request,context,url}:LoaderFunctionArgs){
  const {user}=await requireOwner(request,context,url);
  const {env}=context.get(runtimeContext);
  return {csrf:csrfToken(request,context),configured:!!env.TELEGRAM_CONFIG && !!env.CANVA_TELEGRAM,
    jobs:telegramRows.parse(await telegramJob(env,{p_action:"list",p_actor:user.id}))};
}
export async function action({request,context,url}:ActionFunctionArgs){
  const {user}=await requireOwner(request,context,url);
  const form=await secureForm(request);
  const runtime=context.get(runtimeContext);
  try {
    if(form.get("intent")==="link"){
      const job=z.uuid().parse(form.get("job"));
      const source=z.string().regex(/^\d{1,20}$/).parse(form.get("source"));
      const telegram=z.string().regex(/^\d{1,20}$/).parse(form.get("telegram"));
      if(!runtime.env.BITE_API_KEY) throw new Error("missing");
      const existing=await fetchBiteOrder(source,runtime.env.BITE_API_KEY); // GET only; never purchase.
      if(existing.orderId!==source) throw new Error("unknown");
      await telegramJob(runtime.env,{p_action:"link",p_actor:user.id,p_job:job,p_source:source,p_telegram:telegram});
    }else if(form.get("intent")!=="process") throw new Error("invalid");
    runtime.ctx.waitUntil(wakeCanvaTelegram(runtime.env).then(()=>undefined));
    return {message:"Đã lưu yêu cầu. Tải lại sau ít giây để xem kết quả gửi. Không đặt mua thêm đơn Bite."};
  }catch{return {message:"Chưa gửi email. Kiểm tra mã đơn, liên kết và cấu hình Telegram; đơn chưa rõ sẽ được giữ để xử lý."};}
}
const stateLabels:Record<string,string>={unlinked:"Chưa liên kết với đơn Telegram",queued:"Đang chờ gửi email",sending:"Đang xử lý — không gửi lại",sent:"Đã gửi email qua Telegram",attention:"Cần kiểm tra trước khi tiếp tục"};
export default function AdminTelegram(){
  const {csrf,configured,jobs}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  return <main className="admin-workspace" style={{padding:"2rem",maxWidth:1100,margin:"auto"}}>
    <Link to="/admin/nguon-hang?view=orders">← Đơn đặt từ Bite</Link>
    <h1>Gửi email Canva qua Telegram</h1>
    <p>{configured?"Đã có cấu hình Telegram trên máy chủ.":"Chưa kết nối tài khoản Telegram. Chạy bước đăng nhập riêng trên máy của bạn theo hướng dẫn thiết lập."}</p>
    <p>Email chỉ được gửi cho đơn đã xác nhận thanh toán và đã liên kết đúng đơn Telegram. Gửi email thành công chưa có nghĩa là lời mời Canva đã hoàn tất.</p>
    {result && <p role="status">{result.message}</p>}
    <Form method="post"><input type="hidden" name="csrf" value={csrf}/><button name="intent" value="process" disabled={!configured}>Xử lý email đang chờ</button></Form>
    {jobs.map(job=><section key={job.jobId} style={{padding:"1.25rem",border:"1px solid currentColor",borderRadius:12,marginTop:"1rem"}}>
      <h2>Đơn Hubby {job.orderId.slice(0,8)}</h2>
      <p>API Bite: {job.sourceId ?? "Chưa ghi nhận"} · Telegram: {job.telegramOrderId ?? "Chưa liên kết"}</p>
      <p>{stateLabels[job.state] ?? "Cần kiểm tra"}{job.messageId ? ` · Tin nhắn #${job.messageId}`:""}</p>
      {job.issue && <p>Chưa xác nhận được việc gửi. Kiểm tra hội thoại Bite trước khi xử lý tiếp; hệ thống đã dừng các email tiếp theo để tránh gắn nhầm đơn.</p>}
      {job.state==="unlinked" && <Form method="post">
        <input type="hidden" name="csrf" value={csrf}/><input type="hidden" name="job" value={job.jobId}/>
        <label>Mã đơn API Bite <input name="source" required pattern="[0-9]{1,20}" defaultValue={job.sourceId ?? ""}/></label>
        <label>Mã đơn trong bot Telegram <input name="telegram" required pattern="[0-9]{1,20}"/></label>
        <p>Chỉ liên kết khi đã xác định hai mã thuộc cùng một lần mua. Không dùng mã sản phẩm.</p>
        <button name="intent" value="link">Liên kết đơn và gửi email</button>
      </Form>}
    </section>)}
  </main>;
}
