import { Button } from '@/components/Button';
import { getPreferences } from '@/lib/preferences';

export default function SettingsPage() {
  return <main><h1>설정</h1><p>{getPreferences().weekStartsOn}</p><Button>저장</Button></main>;
}
