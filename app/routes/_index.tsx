import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { ControlPanel } from '~/components/@settings';
import { SettingsButton } from '~/components/ui/SettingsButton';
import { useState } from 'react';

export const meta: MetaFunction = () => {
  return [{ title: 'Nut' }];
};

export const loader = () => json({});

export default function Index() {
  const [showControlPanel, setShowControlPanel] = useState(false);

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      <div className="fixed bottom-4 right-4">
        <SettingsButton onClick={() => setShowControlPanel(true)} />
      </div>
      <ClientOnly>
        {() => <ControlPanel open={showControlPanel} onClose={() => setShowControlPanel(false)} />}
      </ClientOnly>
    </div>
  );
}
