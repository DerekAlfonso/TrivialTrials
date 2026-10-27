import { APP_NAME } from '../config';

export function Logo({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const [first, ...rest] = APP_NAME.toUpperCase().split(' ');
  const cls = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl sm:text-6xl',
    xl: 'text-[7vw]',
  }[size];
  return (
    <div className={`logo-text select-none text-center leading-[0.95] ${cls}`} aria-label={APP_NAME}>
      <div>{first}</div>
      {rest.length > 0 && <div>{rest.join(' ')}</div>}
    </div>
  );
}

export function LogoInline() {
  return <span className="logo-text text-lg whitespace-nowrap">{APP_NAME.toUpperCase()}</span>;
}
