import { NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const useStream = req.headers.get('accept') === 'text/event-stream';

    if (useStream) {
      // SSE streaming passthrough — zero buffering
      const response = await fetch(`${PYTHON_BACKEND_URL}/explain-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        return NextResponse.json(
          { error: 'Failed to connect to AI backend' },
          { status: response.status || 502 }
        );
      }

      // Pass through the SSE stream directly
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming fallback
    const response = await fetch(`${PYTHON_BACKEND_URL}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Python backend error:', error);
      return NextResponse.json(
        { error: 'Failed to generate explanation' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to AI backend. Make sure the Python server is running on port 8000.' },
      { status: 502 }
    );
  }
}