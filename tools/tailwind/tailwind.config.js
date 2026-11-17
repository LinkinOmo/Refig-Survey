// Precompiled Tailwind for the GAS web app (replaces the cdn.tailwindcss.com runtime JIT).
// Scans every top-level page/template and .gs file (server code also emits class strings).
// Rebuild after adding NEW utility classes:  node tools/tailwind/build.js  (see build.js header)
module.exports = {
  content: [
    '../../*.html',
    '../../*.gs',
    '!../../TailwindCss.html', // the build output itself — scanning it would make the CSS grow every build
  ],
  // Classes assembled at runtime from a colour variable — invisible to the content scan.
  safelist: [
    // hyper-status.html card(): 'border-' + color + '-500' / 'text-' + color + '-700'
    { pattern: /^(border|text)-(slate|emerald|sky|red|amber|rose|indigo)-(500|700)$/ },
    // HyperParkingSurveyTab.html _hpkScopeBlock(): border-/bg-/text- + 'blue'|'indigo'
    { pattern: /^(border-(blue|indigo)-200|bg-(blue|indigo)-50\/40|text-(blue|indigo)-800)$/ },
  ],
  theme: { extend: {} },
  plugins: [],
};
