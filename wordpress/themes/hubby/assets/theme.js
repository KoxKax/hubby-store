document.querySelectorAll('.banner-stack').forEach((stack) => {
  const slides = [...stack.querySelectorAll('.banner')];
  const buttons = [...stack.querySelectorAll('[data-slide]')];
  const pause = stack.querySelector('.pause-banner');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, paused = false, hovering = false, focused = false;
  function show(index) {
    current = index;
    slides.forEach((slide, i) => { slide.hidden = i !== index; slide.classList.toggle('active', i === index); });
    buttons.forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => show(i)));
  pause?.addEventListener('click', () => { paused = !paused; pause.textContent = paused ? 'Tiếp tục banner' : 'Tạm dừng banner'; });
  stack.addEventListener('mouseenter', () => { hovering = true; });
  stack.addEventListener('mouseleave', () => { hovering = false; });
  stack.addEventListener('focusin', () => { focused = true; });
  stack.addEventListener('focusout', (event) => { focused = stack.contains(event.relatedTarget); });
  if (slides.length > 1) setInterval(() => {
    if (!paused && !hovering && !focused && !motion.matches && !document.hidden) show((current + 1) % slides.length);
  }, 6000);
});
