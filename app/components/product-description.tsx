import type { ReactNode } from "react";

const bulletPattern = /^\s*(?:[•●▪*\-–✓✔]|\d+[.)])\s+/u;
const sectionPattern = /^(?:giới thiệu(?: sản phẩm)?|bạn nhận được(?: những)? (?:lợi ích|quyền lợi)|sản phẩm giúp bạn làm được gì\??|ứng dụng trong công việc và cuộc sống|chi tiết gói,? cách nhận và điều kiện sử dụng|.+ hỗ trợ bạn như thế nào\??|lợi ích(?: nổi bật)?|tính năng(?: nổi bật)?|điểm nổi bật|quyền lợi(?: của gói)?|cách (?:nhận(?: (?:sản phẩm|hàng|và (?:kích hoạt|đăng nhập)))?|sử dụng|kích hoạt|bắt đầu(?: xem)?|đăng nhập|thanh toán)|hướng dẫn(?: sử dụng|kích hoạt|nhận hàng)?|gói .+ tại hubby|vì sao .+\?|tại sao .+\?|lưu ý(?: khi sử dụng)?|điều kiện(?: sử dụng|tham gia|kích hoạt)?|thông tin (?:gói|sản phẩm))[:：]?$/iu;

// Some CMS descriptions put a section title and its first sentence on one line.
// Separate only known headings followed by a sentence, or an explicit colon.
const inlineSectionPattern = /^(cách nhận và (?:kích hoạt|đăng nhập)|cách nhận sản phẩm|cách bắt đầu xem|cách (?:sử dụng|kích hoạt|đăng nhập)|hướng dẫn (?:sử dụng|kích hoạt|nhận hàng)|lưu ý khi sử dụng|điều kiện sử dụng|thông tin gói và cách sử dụng|chi tiết gói,? cách nhận và điều kiện sử dụng|tính năng nổi bật|quyền lợi của gói)(?:\s*[:：–—]\s*|\s+(?=(?:Cung cấp|Nhập|Mở|Truy cập|Sau khi|Khi|Bạn|Hãy|Đăng nhập|Làm theo|Nhận|Sử dụng|Chọn|Gửi|Đọc|Thực hiện|Để)(?=\s|$)))(.+)$/iu;

function plainHeading(line: string) {
  return line.trim().replace(/^#{1,3}\s+/, "").replace(/^\*\*(.+)\*\*$/u, "$1").replace(/[:：]\s*$/, "");
}

function isHeading(line: string, firstLine: boolean) {
  const value = plainHeading(line);
  if (/^(?:Bạn có thể làm gì với .+\?|Thêm tiện ích cho mỗi ngày|Thông tin gói và cách nhận)$/iu.test(value)) return true;
  if (value.length > 100 || /[.!]$/.test(value)) return false;
  return /^#{2,3}\s+\S/.test(line) || sectionPattern.test(value) || (firstLine && /\S\s+[—–]\s+\S/.test(value));
}

/** Render Owner-authored plain text, retaining line breaks and lists without HTML. */
export function ProductDescription({ text, productName }: { text: string; productName?: string }) {
  // Pasted CMS copy can contain native, Unicode or escaped line breaks.
  // Only interpret literal \\n when no native breaks exist, so ordinary text is preserved.
  const normalized = text.replace(/\r\n?|[\u2028\u2029]/g, "\n");
  const lines = (normalized.includes("\n") ? normalized : normalized.replace(/\\n/g, "\n"))
    .replace(/\s+([•●▪])\s+(?=\S)/gu, "\n$1 ")
    .split("\n");
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      nodes.push(<p key={key++}>{paragraph.join("\n")}</p>);
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      nodes.push(
        <ul key={key++}>
          {bullets.map((item, index) => <li key={index}>{item}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const [index, original] of lines.entries()) {
    const line = original.trim();
    const namedLead = index === 0 && productName
      ? line.match(/^(.+?)\s+[—–]\s+(.+)$/u)
      : null;
    const isProductLead = Boolean(
      namedLead &&
        (namedLead[1]?.length ?? 0) >= 3 &&
        productName?.toLocaleLowerCase("vi-VN").includes((namedLead[1] ?? "").toLocaleLowerCase("vi-VN")),
    );
    if (!line) {
      flushParagraph();
      flushBullets();
    } else if (isProductLead && namedLead) {
      flushParagraph();
      flushBullets();
      nodes.push(<p className="product-description-lead" key={key++}>{namedLead[2]}</p>);
    } else if (bulletPattern.test(line)) {
      flushParagraph();
      bullets.push(line.replace(bulletPattern, ""));
    } else if (inlineSectionPattern.test(line)) {
      const match = line.match(inlineSectionPattern);
      if (!match) continue;
      flushParagraph();
      flushBullets();
      nodes.push(<h3 key={key++}>{match[1]}</h3>);
      const content = match[2]?.trim();
      if (content) {
        if (bulletPattern.test(content)) bullets.push(content.replace(bulletPattern, ""));
        else paragraph.push(content);
      }
    } else if (isHeading(line, index === 0)) {
      flushParagraph();
      flushBullets();
      nodes.push(<h3 key={key++}>{plainHeading(line)}</h3>);
    } else if (/^\s{2,}\S/.test(original) && bullets.length) {
      // Indented lines continue a preceding list item in pasted CMS text.
      bullets[bullets.length - 1] += ` ${line}`;
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();

  return <div className="product-description">{nodes}</div>;
}
