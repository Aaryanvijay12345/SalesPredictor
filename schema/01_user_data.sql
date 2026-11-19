-- ============================================================================
-- SALESPREDICTER: USER & TENANT DATA SCHEMA (STRICT TENANT ISOLATION)
-- Dataset: `bustling-wharf-485615-s9.sales_predictor`
-- ============================================================================

-- 1. Master Virtual Kitchens & Station Outlets Hierarchy
-- Isolation: Each physical outlet is scoped to its parent virtual kitchen.
-- Onboarding: Zero-friction B2B "Join-by-Code" (`KITCH-AA`, `KITCH-AB`, etc.).
CREATE TABLE IF NOT EXISTS `bustling-wharf-485615-s9.sales_predictor.kitchens_and_outlets` (
    kitchen_id STRING NOT NULL OPTIONS(description="Tenant ID of Central Virtual Kitchen (e.g. kitchen_a)"),
    kitchen_name STRING NOT NULL OPTIONS(description="Display brand name of Virtual Kitchen"),
    outlet_id STRING NOT NULL OPTIONS(description="Sub-tenant station ID (e.g. outlet_aa)"),
    outlet_name STRING NOT NULL OPTIONS(description="Physical station location name (e.g. Civil Lines Express)"),
    join_code STRING NOT NULL OPTIONS(description="4-8 char join code for zero-friction PIN onboarding"),
    chef_name STRING NOT NULL OPTIONS(description="Name of the Head Station Chef"),
    city STRING NOT NULL OPTIONS(description="City of operation for local weather & market calibration"),
    active BOOLEAN DEFAULT TRUE OPTIONS(description="Status of station")
);

-- 2. Private Historical Restaurant Sales (Partitioned Time-Series)
-- Stores shift-level item preparation and sales per tenant outlet.
CREATE TABLE IF NOT EXISTS `bustling-wharf-485615-s9.sales_predictor.restaurant_sales` (
    sale_date DATE NOT NULL OPTIONS(description="Date of business operation"),
    kitchen_id STRING NOT NULL OPTIONS(description="Parent tenant ID"),
    outlet_id STRING NOT NULL OPTIONS(description="Outlet station ID"),
    meal_slot STRING NOT NULL OPTIONS(description="Shift category: breakfast, lunch, dinner"),
    item_name STRING NOT NULL OPTIONS(description="Culinary menu or prep item"),
    quantity_sold INT64 NOT NULL OPTIONS(description="Units/kg prepared and sold"),
    unit STRING NOT NULL OPTIONS(description="kg, portions, litres, packets"),
    revenue NUMERIC NOT NULL OPTIONS(description="Total sales revenue generated in INR")
)
PARTITION BY sale_date
CLUSTER BY kitchen_id, outlet_id, meal_slot;

-- 3. Daily Raw Procurement & Mandi Receipts Ingestion (Partitioned)
-- Ingests handwritten mandi parchis, local dairy slips, and cash receipts.
CREATE TABLE IF NOT EXISTS `bustling-wharf-485615-s9.sales_predictor.daily_raw_inputs` (
    entry_id STRING NOT NULL OPTIONS(description="Unique UUID per procurement slip"),
    created_at TIMESTAMP NOT NULL OPTIONS(description="Timestamp of capture/entry"),
    kitchen_id STRING NOT NULL OPTIONS(description="Tenant ID"),
    outlet_id STRING NOT NULL OPTIONS(description="Outlet ID"),
    source_type STRING NOT NULL OPTIONS(description="'GEMINI_OCR' for camera scans, 'MANUAL_CHEF' for cash items"),
    vendor_name STRING OPTIONS(description="Extracted or entered vendor name"),
    item_name STRING NOT NULL OPTIONS(description="Raw ingredient name"),
    quantity NUMERIC NOT NULL OPTIONS(description="Quantity purchased"),
    unit STRING NOT NULL OPTIONS(description="kg, packet, litre, piece"),
    rate NUMERIC NOT NULL OPTIONS(description="Unit price in INR"),
    row_total NUMERIC NOT NULL OPTIONS(description="Line item total in INR"),
    total_bill_amount NUMERIC NOT NULL OPTIONS(description="Grand total amount of the invoice"),
    chef_verified BOOLEAN DEFAULT TRUE OPTIONS(description="True if confirmed by chef before submission")
)
PARTITION BY DATE(created_at)
CLUSTER BY kitchen_id, outlet_id;

