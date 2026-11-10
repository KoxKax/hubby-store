document.querySelectorAll('.hubby-delivery-form').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const output = form.querySelector('.hubby-delivery-result');
    const button = form.querySelector('button');
    button.disabled = true;
    output.textContent = 'Đang mở thông tin…';
    try {
      const response = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.data?.products)) throw new Error(result.data?.message || 'Chưa thể mở sản phẩm.');
      output.replaceChildren();
      result.data.products.forEach((value, index) => {
        const heading = document.createElement('h3'); heading.textContent = `Sản phẩm ${index + 1}`;
        const text = document.createElement('pre'); text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere'; text.textContent = value;
        output.append(heading, text);
      });
      button.textContent = 'Ẩn thông tin';
      button.type = 'button';
      button.onclick = () => { output.replaceChildren(); button.remove(); };
    } catch (error) { output.textContent = error.message; }
    finally { button.disabled = false; }
  });
});
