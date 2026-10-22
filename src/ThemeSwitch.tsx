import {useLayoutEffect, useState} from 'react';
import type {Language} from './types';
import {applyDisplayTheme, DISPLAY_THEMES, loadDisplayTheme, normalizeDisplayTheme, persistDisplayTheme} from './displayTheme';

/** Local presentation only: no App state, identity, draft or RPC changes. */
export function ThemeSwitch({lang}: {lang: Language}) {
  const [theme, setTheme] = useState(loadDisplayTheme);
  useLayoutEffect(() => applyDisplayTheme(theme), [theme]);
  const names = lang === 'zh'
    ? {normal: '正常', dark: '暗黑', eye: '護眼'}
    : {normal: 'Normal', dark: 'Dark', eye: 'Eye care'};
  return <select className="btn small neutral theme-switch" lang={lang}
    aria-label={lang === 'zh' ? '顯示模式' : 'Display mode'}
    title={lang === 'zh' ? '顯示模式（保存在此瀏覽器）' : 'Display mode (saved in this browser)'}
    value={theme} onChange={event => {
      const next = normalizeDisplayTheme(event.currentTarget.value);
      setTheme(next);
      persistDisplayTheme(next);
    }}>
    {DISPLAY_THEMES.map(value => <option key={value} value={value}>{names[value]}</option>)}
  </select>;
}
