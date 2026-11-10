import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Reuse the current storefront's exact copy adapters. Do not invent replacement
// text or rewrite the raw published snapshot / unpublished remote CMS draft.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
}});
const { experienceOf, imageSlides, customerCopy, customerFaqs } = await import('../../app/content/experience.ts');
const { getStorefrontContent } = await import('../../app/content/fixtures.ts');
const source = JSON.parse(readFileSync(new URL('../.private/published.json', import.meta.url), 'utf8'));
const output = structuredClone(source);
output.experience = { ...experienceOf(source), slides: imageSlides(source) };
const historicalFaqs = getStorefrontContent().faqs;
if (source.faqs.length === historicalFaqs.length && source.faqs.every((faq, index) => faq.question === historicalFaqs[index].question && faq.answer === historicalFaqs[index].answer)) output.faqs = customerFaqs;
output.announcement.text = output.experience.notices[0]?.text ?? source.announcement.text;
output.brand.footer = customerCopy(source.brand.footer);
output.support.description = customerCopy(source.support.description);
output.products = source.products.map((product) => ({ ...product, description: customerCopy(product.description), features: product.features.map(customerCopy) }));
output.policies = source.policies.map((policy) => ({ ...policy, body: customerCopy(policy.body) }));
writeFileSync(new URL('../.private/presentation-v2.json', import.meta.url), JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log('Rendered presentation exported separately; raw catalog and remote CMS unchanged.');
