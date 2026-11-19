import { NextRequest, NextResponse } from 'next/server';
import { streamIngestProcurement, fetchRecentIngestItems } from '@/lib/db/ingest';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const kitchenId = searchParams.get('kitchen_id') || 'kitchen_a';
    const outletId = searchParams.get('outlet_id') || 'outlet_aa';

    const items = await fetchRecentIngestItems(kitchenId, outletId, 10);
    return NextResponse.json({
      success: true,
      items
    });
  } catch (error: any) {
    console.error('Ingest GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No items provided for ingestion' },
        { status: 400 }
      );
    }

    const result = await streamIngestProcurement(body);

    return NextResponse.json({
      success: true,
      entry_id: result.entryId,
      inserted_rows: result.insertedRows,
      total_amount: result.totalAmount,
      message: `Successfully streamed ${result.insertedRows} procurement item(s) to BigQuery`
    });
  } catch (error: any) {
    console.error('Ingest Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to ingest procurement items' },
      { status: 500 }
    );
  }
}
