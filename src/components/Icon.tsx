/** Lucide 風格的線性圖示。一律向量，介面中不使用 emoji 當圖示。 */

const PATHS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.8 12.2 20 3M17 6l3 3M15 8l2 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert:
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  trendUp: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  trendDown: '<path d="M22 17 13.5 8.5 8.5 13.5 2 7"/><path d="M16 17h6v-6"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  file: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5M9 13h6M9 17h4"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-3.5-7.1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  scale: '<path d="M12 3v18M7 21h10M4 7h16M6 7 3 14h6ZM18 7l-3 7h6Z"/>',
  news: '<path d="M4 5h13a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z"/><path d="M7 9h7M7 13h7M7 17h4"/><path d="M18 9h2a1 1 0 0 1 1 1v9"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 9v9M17 12v6"/>',
  play: '<path d="M7 4.5v15l13-7.5Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  terminal: '<path d="m5 8 4 4-4 4M13 16h6"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  external:
    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="M10.7 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.5 7.7A17 17 0 0 0 2 12s3.6 6 10 6c1.6 0 3-.4 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  dot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  branch:
    '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 7.5v9M8.5 19h4a3 3 0 0 0 3-3v-2M15.5 12h-3a3 3 0 0 1-3-3V7"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M1.5 9a15 15 0 0 1 21 0"/>',
  package: '<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  minus: '<path d="M5 12h14"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  restore: '<rect x="3" y="7" width="12" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>',
} as const

export type IconName = keyof typeof PATHS

interface Props {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
  className?: string
  spin?: boolean
  style?: React.CSSProperties
}

export function Icon({ name, size = 'md', className = '', spin, style }: Props) {
  const cls = [
    'ic',
    size === 'sm' ? 'ic-sm' : size === 'lg' ? 'ic-lg' : '',
    spin ? 'spin' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}
