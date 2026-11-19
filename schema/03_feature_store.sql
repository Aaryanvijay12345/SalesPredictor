-- ============================================================================
-- SALESPREDICTER: MULTI-TENANT FEATURE STORE (DATA FUSION LAYER)
-- Merges Private Tenant Sales with Public Weather Anomalies & Festive Events
-- ============================================================================

CREATE OR REPLACE VIEW `bustling-wharf-485615-s9.sales_predictor.sales_feature_store` AS
SELECT 
    s.sale_date,
    s.kitchen_id,
    s.outlet_id,
    s.meal_slot,
    s.item_name,
    s.quantity_sold,
    s.revenue,
    s.unit,
    -- Public Weather Features (NOAA Sanganer Station 423480)
    COALESCE(w.mean_temp_c, 25.0) AS ambient_temp_c,
    COALESCE(w.precipitation_mm, 0.0) AS rain_mm,
    COALESCE(w.is_raining, FALSE) AS was_raining,
    -- Public Festive & Calendar Features
    c.is_weekend,
    c.day_of_week_num,
    c.regional_event_context,
    c.base_event_demand_multiplier,
    -- Derived Dynamic Impact Factors
    CASE 
      WHEN COALESCE(w.is_raining, FALSE) AND s.item_name LIKE '%Biryani%' THEN 1.25
      WHEN COALESCE(w.is_raining, FALSE) AND s.item_name LIKE '%Gravy%' THEN 1.20
      WHEN c.is_weekend THEN 1.20
      ELSE 1.00
    END AS actual_weather_multiplier
FROM `bustling-wharf-485615-s9.sales_predictor.restaurant_sales` s
LEFT JOIN `bustling-wharf-485615-s9.sales_predictor.public_weather_jaipur` w
  ON s.sale_date = w.weather_date
LEFT JOIN `bustling-wharf-485615-s9.sales_predictor.public_festive_calendar` c
  ON s.sale_date = c.cal_date;

