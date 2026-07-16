-- ============================================
-- PHASE 1: MIGRATION SCRIPT
-- Run this in order. Back up your DB first.
-- ============================================

-- Step 1: Create new tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  plan ENUM('free', 'maker', 'studio', 'atelier') DEFAULT 'free' NOT NULL,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status ENUM('trialing', 'active', 'past_due', 'canceled', 'inactive') DEFAULT 'inactive' NOT NULL,
  trial_ends_at TIMESTAMP NULL,
  onboarding_step INT DEFAULT 0,
  onboarding_completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS iteration_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  request TEXT NOT NULL,
  solution TEXT NOT NULL,
  deployed_at TIMESTAMP NULL,
  validated BOOLEAN DEFAULT FALSE,
  impact ENUM('critical', 'high', 'medium', 'low'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feature_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  feature VARCHAR(64) NOT NULL,
  count INT DEFAULT 0,
  last_used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  session_id VARCHAR(64) NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  resolved BOOLEAN DEFAULT TRUE,
  escalated_to VARCHAR(255),
  response_time_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Step 2: Seed Kalakosh as Tenant #1
-- ----------------------------

INSERT INTO tenants (id, slug, name, domain, plan, subscription_status) 
VALUES (1, 'kalakosh', 'Kalakosh', 'kalakosh.ch', 'maker', 'active')
ON DUPLICATE KEY UPDATE 
  name = 'Kalakosh', 
  domain = 'kalakosh.ch', 
  plan = 'maker',
  subscription_status = 'active';

-- Step 3: Add tenant_id to existing tables
-- ----------------------------
-- IMPORTANT: Add tenant_id to ALL tables that store per-tenant data
-- Do this ONE TABLE AT A TIME. Test after each.

-- Example for 'products' table:
-- ALTER TABLE products ADD COLUMN tenant_id INT NULL;
-- UPDATE products SET tenant_id = 1 WHERE tenant_id IS NULL;
-- ALTER TABLE products MODIFY tenant_id INT NOT NULL;
-- ALTER TABLE products ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Example for 'orders' table:
-- ALTER TABLE orders ADD COLUMN tenant_id INT NULL;
-- UPDATE orders SET tenant_id = 1 WHERE tenant_id IS NULL;
-- ALTER TABLE orders MODIFY tenant_id INT NOT NULL;
-- ALTER TABLE orders ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Example for 'users' table:
-- ALTER TABLE users ADD COLUMN tenant_id INT NULL;
-- UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
-- ALTER TABLE users MODIFY tenant_id INT NOT NULL;
-- ALTER TABLE users ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Step 4: Create indexes for performance
-- ----------------------------

CREATE INDEX idx_iteration_logs_tenant ON iteration_logs(tenant_id);
CREATE INDEX idx_iteration_logs_created ON iteration_logs(created_at);
CREATE INDEX idx_feature_usage_tenant_feature ON feature_usage(tenant_id, feature);
CREATE INDEX idx_chatbot_tenant_session ON chatbot_conversations(tenant_id, session_id);
CREATE INDEX idx_chatbot_created ON chatbot_conversations(created_at);

-- Step 5: Verify
-- ----------------------------

SELECT 'Tenants:' as check_item, COUNT(*) as count FROM tenants
UNION ALL
SELECT 'Iteration logs:', COUNT(*) FROM iteration_logs
UNION ALL
SELECT 'Feature usage:', COUNT(*) FROM feature_usage
UNION ALL
SELECT 'Chatbot conversations:', COUNT(*) FROM chatbot_conversations;
