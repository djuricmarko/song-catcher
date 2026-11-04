import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import App from './App';
import { APP_ROOT } from './api/client';
import { QueueProvider } from './hooks/useQueue';
import { COMPACT_LAYOUT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemedToaster() {
  const { preference } = useTheme();
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY);

  if (compact) {
    // Sit just above the bottom tab bar, clear of the home indicator.
    const bottom = 'calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 0.75rem)';
    return (
      <Toaster
        position="bottom-center"
        theme={preference}
        richColors
        visibleToasts={2}
        offset={{ bottom }}
        mobileOffset={{ bottom, left: 12, right: 12 }}
        swipeDirections={['left', 'right', 'bottom']}
      />
    );
  }
  return <Toaster position="bottom-right" theme={preference} richColors />;
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={APP_ROOT || '/'}>
        <QueueProvider>
          <App />
        </QueueProvider>
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
