import { NextRequest, NextResponse } from 'next/server';

// In-memory timer state (in production, use Redis or similar)
const timerStates: Map<string, { elapsed: number; status: 'running' | 'paused'; lastUpdate: number }> = new Map();

export async function POST(request: NextRequest) {
  try {
    const { sessionId, action, elapsed } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    let state = timerStates.get(sessionId);

    switch (action) {
      case 'start':
        if (!state) {
          state = { elapsed: 0, status: 'running', lastUpdate: Date.now() };
        } else {
          state.status = 'running';
          state.lastUpdate = Date.now();
        }
        break;

      case 'pause':
        if (state) {
          // Calculate elapsed time since lastUpdate
          const now = Date.now();
          const additionalElapsed = Math.floor((now - state.lastUpdate) / 1000);
          state.elapsed += additionalElapsed;
          state.status = 'paused';
          state.lastUpdate = now;
        } else {
          state = { elapsed: 0, status: 'paused', lastUpdate: Date.now() };
        }
        break;

      case 'reset':
        state = { elapsed: 0, status: 'paused', lastUpdate: Date.now() };
        break;

      case 'sync':
        if (!state) {
          state = { elapsed: elapsed || 0, status: 'paused', lastUpdate: Date.now() };
        } else if (state.status === 'running') {
          // Calculate current elapsed
          const now = Date.now();
          const additionalElapsed = Math.floor((now - state.lastUpdate) / 1000);
          state.elapsed += additionalElapsed;
          state.lastUpdate = now;
        }
        break;

      default:
        return NextResponse.json({ error: 'Invalid action. Use: start, pause, reset, sync' }, { status: 400 });
    }

    timerStates.set(sessionId, state);

    return NextResponse.json({
      elapsed: state.elapsed,
      status: state.status,
      formatted: formatTime(state.elapsed)
    });

  } catch (error) {
    console.error('Timer API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const state = timerStates.get(sessionId);

  if (!state) {
    return NextResponse.json({
      elapsed: 0,
      status: 'paused',
      formatted: '00:00'
    });
  }

  let currentElapsed = state.elapsed;
  if (state.status === 'running') {
    const now = Date.now();
    const additionalElapsed = Math.floor((now - state.lastUpdate) / 1000);
    currentElapsed += additionalElapsed;
  }

  return NextResponse.json({
    elapsed: currentElapsed,
    status: state.status,
    formatted: formatTime(currentElapsed)
  });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
