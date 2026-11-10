import Link from 'next/link';

export function AppNavigation() {
  return <nav aria-label="주요 화면"><Link href="/tasks">작업 목록</Link><Link href="/settings">설정</Link></nav>;
}
