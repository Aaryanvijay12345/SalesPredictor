import { NextRequest, NextResponse } from 'next/server';
import { fetchAudioFromGcs } from '@/lib/gcp';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get('path');

    if (!path) {
      return new NextResponse('Missing path parameter', { status: 400 });
    }

    // Safety check against directory traversal
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      return new NextResponse('Invalid path parameter', { status: 400 });
    }

    // Fetch binary MP3 from private GCS using server GCP Bearer token
    const audioBuffer = await fetchAudioFromGcs(path);
    const totalSize = audioBuffer.length;

    // Handle HTTP Range header for mobile audio streaming & scrubber seeking
    const range = request.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        return new NextResponse('Requested range not satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${totalSize}`
          }
        });
      }

      const chunk = audioBuffer.subarray(start, end + 1);

      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length.toString(),
          'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800'
        }
      });
    }

    // Full audio response
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': totalSize.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800'
      }
    });
  } catch (error: any) {
    console.error('Error streaming audio from private GCS:', error);
    return new NextResponse(error.message || 'Failed to stream audio', { status: 500 });
  }
}
