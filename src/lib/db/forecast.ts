import { queryBigQuery, PROJECT_ID, DATASET_ID } from '../gcp';

export interface ForecastItem {
  meal_slot: string;
  item_name: string;
  unit: string;
  predicted_qty: string | number;
  lower_bound_qty: string | number;
  upper_bound_qty: string | number;
}

/**
 * Executes zero-shot multivariate time-series forecasting using Google Research's
 * TimesFM 3.0 foundation model directly via BigQuery AI.FORECAST.
 * Incorporates past weather covariates and festive demand multipliers.
 */
export async function fetchTimesFMForecast(
  kitchenId: string,
  outletId: string,
  mealSlot: string
): Promise<ForecastItem[]> {
  const timesfmSql = `
    SELECT 
      meal_slot,
      item_name,
      unit,
      ROUND(CAST(quantity_sold.value AS FLOAT64), 0) AS predicted_qty,
      ROUND(CAST(quantity_sold.prediction_interval_lower_bound AS FLOAT64), 0) AS lower_bound_qty,
      ROUND(CAST(quantity_sold.prediction_interval_upper_bound AS FLOAT64), 0) AS upper_bound_qty
    FROM AI.FORECAST(
      (
        SELECT 
          CAST(sale_date AS TIMESTAMP) AS sale_timestamp,
          kitchen_id,
          outlet_id,
          meal_slot,
          item_name,
          unit,
          quantity_sold,
          ambient_temp_c,
          rain_mm,
          base_event_demand_multiplier
        FROM \`${PROJECT_ID}.${DATASET_ID}.sales_feature_store\`
        WHERE kitchen_id = '${kitchenId}'
          AND outlet_id = '${outletId}'
          AND meal_slot = '${mealSlot}'
      ),
      timestamp_col => 'sale_timestamp',
      model => 'TimesFM 3.0',
      target_cols => ['quantity_sold'],
      past_covariate_cols => ['ambient_temp_c', 'rain_mm', 'base_event_demand_multiplier'],
      id_cols => ['kitchen_id', 'outlet_id', 'meal_slot', 'item_name', 'unit'],
      horizon => 1,
      confidence_level => 0.90
    );
  `;

  try {
    const items = await queryBigQuery<ForecastItem>(timesfmSql);
    if (items && items.length > 0) {
      return items;
    }
  } catch (err) {
    console.warn('TimesFM 3.0 query fallback to rolling feature view:', err);
  }

  // Fallback to feature store view
  const fallbackSql = `
    SELECT 
      meal_slot,
      item_name,
      unit,
      predicted_qty,
      lower_bound_qty,
      upper_bound_qty
    FROM \`${PROJECT_ID}.${DATASET_ID}.demand_forecaster\`
    WHERE kitchen_id = '${kitchenId}'
      AND outlet_id = '${outletId}'
      AND meal_slot = '${mealSlot}';
  `;

  return queryBigQuery<ForecastItem>(fallbackSql);
}

// Backwards-compatible alias for existing imports
export const fetchArimaForecast = fetchTimesFMForecast;
