import { render, screen, waitFor } from '@testing-library/react';
import { HealthStatus } from '@/components/HealthStatus';
import * as api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  fetchHealth: jest.fn(),
}));

const mockedFetchHealth = api.fetchHealth as jest.MockedFunction<typeof api.fetchHealth>;

describe('HealthStatus', () => {
  it('shows a loading state initially', () => {
    mockedFetchHealth.mockReturnValue(new Promise(() => {}));
    render(<HealthStatus />);
    expect(screen.getByText(/connecting to server/i)).toBeInTheDocument();
  });

  it('shows connected state on success', async () => {
    mockedFetchHealth.mockResolvedValue({
      status: 'ok',
      service: 'reposcribe-server',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 42,
    });
    render(<HealthStatus />);
    await waitFor(() =>
      expect(screen.getByText(/server connected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/uptime 42s/i)).toBeInTheDocument();
  });

  it('surfaces an error when the server is unreachable', async () => {
    mockedFetchHealth.mockRejectedValue(new Error('Could not reach the server'));
    render(<HealthStatus />);
    await waitFor(() =>
      expect(screen.getByText(/server unreachable/i)).toBeInTheDocument(),
    );
  });
});
