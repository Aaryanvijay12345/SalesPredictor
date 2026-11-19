-- ============================================================================
-- SALESPREDICTER: PUBLIC DATA & EXTERNAL INTEGRATION SCHEMA
-- Connects Google BigQuery Public Datasets without any 3rd party ETL pipelines.
-- ============================================================================

-- 1. Jaipur Sanganer Airport Weather Station Mapping (NOAA GSOD)
-- Station ID: 423480 | Coordinates: Lat 26.824, Lon 75.812
CREATE OR REPLACE VIEW `bustling-wharf-485615-s9.sales_predictor.public_weather_jaipur` AS
SELECT 
    stn AS station_id,
    'JAIPUR / SANGANER AIRPORT' AS station_name,
    date AS weather_date,
    temp AS mean_temp_f,
    ROUND((temp - 32) * 5 / 9, 1) AS mean_temp_c,
    max AS max_temp_f,
    min AS min_temp_f,
    prcp AS precipitation_inches,
    ROUND(prcp * 25.4, 1) AS precipitation_mm,
    rain_drizzle = '1' AS is_raining,
    fog = '1' AS has_fog,
    thunder = '1' AS has_thunderstorm
FROM `bigquery-public-data.noaa_gsod.gsod2024`
WHERE stn = '423480';

-- 2. Indian Public Calendar & Regional Festive Demand Indicators
-- Encapsulates Rajasthan wedding season (Saava) and Indian national holidays.
CREATE OR REPLACE VIEW `bustling-wharf-485615-s9.sales_predictor.public_festive_calendar` AS
SELECT 
    cal_date,
    EXTRACT(DAYOFWEEK FROM cal_date) IN (1, 7) AS is_weekend,
    EXTRACT(DAYOFWEEK FROM cal_date) AS day_of_week_num,
    CASE 
      WHEN EXTRACT(MONTH FROM cal_date) = 11 AND EXTRACT(DAY FROM cal_date) BETWEEN 12 AND 30 
      THEN 'Rajasthan Wedding Season (Saava Surge)'
      WHEN EXTRACT(MONTH FROM cal_date) = 10 AND EXTRACT(DAY FROM cal_date) BETWEEN 25 AND 31 
      THEN 'Diwali & Festive Rush'
      WHEN EXTRACT(MONTH FROM cal_date) = 3 AND EXTRACT(DAY FROM cal_date) BETWEEN 20 AND 28 
      THEN 'Holi & Spring Festival'
      ELSE 'Regular Operational Calendar'
    END AS regional_event_context,
    CASE 
      WHEN EXTRACT(MONTH FROM cal_date) = 11 AND EXTRACT(DAY FROM cal_date) BETWEEN 12 AND 30 THEN 1.35
      WHEN EXTRACT(DAYOFWEEK FROM cal_date) IN (1, 7) THEN 1.20
      ELSE 1.00
    END AS base_event_demand_multiplier
FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY), DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY))) AS cal_date;
