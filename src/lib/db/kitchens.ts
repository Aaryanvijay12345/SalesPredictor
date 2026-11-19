import { queryBigQuery, PROJECT_ID, DATASET_ID } from '../gcp';

export interface OutletRecord {
  kitchen_id: string;
  kitchen_name: string;
  outlet_id: string;
  outlet_name: string;
  join_code: string;
  chef_name: string;
  city: string;
  active: boolean | string;
}

export interface KitchenGroup {
  kitchen_id: string;
  kitchen_name: string;
  city: string;
  outlets: Array<{
    outlet_id: string;
    outlet_name: string;
    join_code: string;
    chef_name: string;
  }>;
}

/**
 * Fetches all active virtual kitchens and station outlets.
 */
export async function fetchActiveKitchens(): Promise<{
  kitchens: KitchenGroup[];
  rawOutlets: OutletRecord[];
}> {
  const sql = `
    SELECT 
      kitchen_id,
      kitchen_name,
      outlet_id,
      outlet_name,
      join_code,
      chef_name,
      city,
      active
    FROM \`${PROJECT_ID}.${DATASET_ID}.kitchens_and_outlets\`
    WHERE active = true
    ORDER BY kitchen_id, outlet_id;
  `;

  const rows = await queryBigQuery<OutletRecord>(sql);

  const map: Record<string, KitchenGroup> = {};
  for (const r of rows) {
    if (!map[r.kitchen_id]) {
      map[r.kitchen_id] = {
        kitchen_id: r.kitchen_id,
        kitchen_name: r.kitchen_name,
        city: r.city,
        outlets: []
      };
    }
    map[r.kitchen_id].outlets.push({
      outlet_id: r.outlet_id,
      outlet_name: r.outlet_name,
      join_code: r.join_code,
      chef_name: r.chef_name
    });
  }

  return {
    kitchens: Object.values(map),
    rawOutlets: rows
  };
}

/**
 * Fetches single outlet record by kitchen_id and outlet_id.
 */
export async function fetchOutletDetails(
  kitchenId: string,
  outletId: string
): Promise<OutletRecord | null> {
  const sql = `
    SELECT kitchen_id, kitchen_name, outlet_id, outlet_name, join_code, chef_name, city, active
    FROM \`${PROJECT_ID}.${DATASET_ID}.kitchens_and_outlets\`
    WHERE kitchen_id = '${kitchenId}' AND outlet_id = '${outletId}'
    LIMIT 1;
  `;

  const rows = await queryBigQuery<OutletRecord>(sql);
  return rows.length > 0 ? rows[0] : null;
}

