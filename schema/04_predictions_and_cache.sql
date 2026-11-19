-- ============================================================================
-- 04_PREDICTIONS_AND_CACHE.SQL
-- BigQuery TimesFM 3.0 Foundation Model Forecasting & Voice Dispatch Cache
-- Target: bustling-wharf-485615-s9.sales_predictor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TimesFM 3.0 Foundation Model View (Multivariate with Weather & Event Covariates)
-- Zero-shot Time Series Foundation Model developed by Google Research.
-- Ingests tenant sales coupled with NOAA weather anomalies & festive multipliers.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW `bustling-wharf-485615-s9.sales_predictor.v_timesfm_live_forecast` AS
SELECT 
  kitchen_id,
  outlet_id,
  meal_slot,
  item_name,
  unit,
  ROUND(CAST(quantity_sold.value AS FLOAT64), 0) AS predicted_qty,
  ROUND(CAST(quantity_sold.prediction_interval_lower_bound AS FLOAT64), 0) AS lower_bound_qty,
  ROUND(CAST(quantity_sold.prediction_interval_upper_bound AS FLOAT64), 0) AS upper_bound_qty,
  ai_forecast_status
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
    FROM `bustling-wharf-485615-s9.sales_predictor.sales_feature_store`
  ),
  timestamp_col => 'sale_timestamp',
  model => 'TimesFM 3.0',
  target_cols => ['quantity_sold'],
  past_covariate_cols => ['ambient_temp_c', 'rain_mm', 'base_event_demand_multiplier'],
  id_cols => ['kitchen_id', 'outlet_id', 'meal_slot', 'item_name', 'unit'],
  horizon => 1,
  confidence_level => 0.90
);

-- ----------------------------------------------------------------------------
-- 2. Daily Multi-Language Voice Bulletin Cache
-- Persists generated natural voice bulletins and audio URLs for instantaneous
-- < 50ms replay on chef PWAs without redundant model invocation costs.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bustling-wharf-485615-s9.sales_predictor.daily_bulletin_cache` (
  forecast_date DATE OPTIONS(description="Calendar forecast date (YYYY-MM-DD)"),
  kitchen_id STRING OPTIONS(description="Tenant master kitchen identifier"),
  outlet_id STRING OPTIONS(description="Specific station outlet identifier"),
  meal_slot STRING OPTIONS(description="breakfast, lunch, or dinner"),
  lang_code STRING OPTIONS(description="ISO 639-1 code: hi, en, bn, mr, gu, ta, te, pa"),
  voice_name STRING OPTIONS(description="Cloud TTS Voice identifier (e.g. hi-IN-Neural2-A, bn-IN-Chirp3-HD-Achernar)"),
  bulletin_text STRING OPTIONS(description="Crisp spoken natural transcript without corporate fluff"),
  audio_url STRING OPTIONS(description="Direct streaming public GCS URL"),
  dynamic_reason STRING OPTIONS(description="Dynamically populated single reason sentence (weather anomaly, festival), NULL if normal"),
  items_json STRING OPTIONS(description="Serialized JSON array of forecast quantities and bounds"),
  created_at TIMESTAMP OPTIONS(description="Timestamp of synthesis and caching")
)
PARTITION BY forecast_date
CLUSTER BY kitchen_id, outlet_id, meal_slot, lang_code;
