import { render, screen, act } from '@testing-library/react';
import { BackendGate } from '@/components/BackendGate';
import * as api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  fetchHealth: jest.fn(),
}));

const mockedFetchHealth = api.fetchHealth as jest.MockedFunction<typeof api.fetchHealth>;

const okHealth = {
  status: 'ok' as const,
  service: 'reposcribe-server' as const,
  timestamp: '2026-01-01T00:00:00.000Z',
  uptimeSeconds: 1,
};

/** Advance fake timers while flushing the promise microtasks in between. */
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

describe('BackendGate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedFetchHealth.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows the wake-up screen while the backend is unreachable, then reveals children once it responds', async () => {
    // Cold start: fail twice, then come up on the third ping.
    mockedFetchHealth
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(okHealth);

    render(
      <BackendGate>
        <div>App content</div>
      </BackendGate>,
    );

    // Nothing rendered during the grace window (no flash on fast backends).
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    expect(screen.queryByText('RepoScribe')).not.toBeInTheDocument();

    // Cross the grace window → branded wake-up screen appears.
    await advance(1000);
    expect(screen.getByText('RepoScribe')).toBeInTheDocument();
    expect(screen.getByText(/waking the backend up/i)).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();

    // Let the retries run through to the successful ping.
    await advance(5000);
    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(screen.queryByText(/waking the backend up/i)).not.toBeInTheDocument();
    expect(mockedFetchHealth).toHaveBeenCalledTimes(3);
  });

  it('advances the reassurance message as time passes', async () => {
    mockedFetchHealth.mockRejectedValue(new Error('down')); // never comes up

    render(
      <BackendGate>
        <div>App content</div>
      </BackendGate>,
    );

    await advance(1000);
    expect(screen.getByText(/waking the backend up/i)).toBeInTheDocument();

    // t≈20s → the mid-wait message.
    await advance(19000);
    expect(screen.getByText(/almost there/i)).toBeInTheDocument();

    // t≈45s → the free-tier explanation (shown in the 30–60s window).
    await advance(25000);
    expect(screen.getByText(/free-tier servers nap/i)).toBeInTheDocument();
  });

  it('reveals children without showing the wake screen when the backend responds immediately', async () => {
    mockedFetchHealth.mockResolvedValue(okHealth);

    render(
      <BackendGate>
        <div>App content</div>
      </BackendGate>,
    );

    // Flush the immediate ping — still inside the grace window.
    await advance(100);

    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(screen.queryByText('RepoScribe')).not.toBeInTheDocument();
    expect(screen.queryByText(/waking the backend up/i)).not.toBeInTheDocument();
  });

  it('reports progress on the progress bar while waking', async () => {
    mockedFetchHealth.mockRejectedValue(new Error('down'));

    render(
      <BackendGate>
        <div>App content</div>
      </BackendGate>,
    );

    await advance(15000);
    const bar = screen.getByRole('progressbar');
    const now = Number(bar.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThanOrEqual(95); // never full until the server responds
  });
});
