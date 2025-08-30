/**
 * PostgreSQL Error Parser
 * Comprehensive mapping of PostgreSQL error codes and constraint names to human-readable messages
 * Includes all constraints from the Flowglad database schema
 */

interface PostgresError extends Error {
  code?: string
  constraint_name?: string
  table_name?: string
  column_name?: string
  detail?: string
  schema_name?: string
  severity?: string
  hint?: string
}

interface ConstraintMapping {
  pattern: RegExp
  getMessage: (matches: RegExpMatchArray, error: PostgresError) => string
}

// Map of constraint names to user-friendly messages
const CONSTRAINT_MESSAGES: Record<string, string | ConstraintMapping> = {
  // ============================================
  // PRODUCTS CONSTRAINTS
  // ============================================
  'products_pricing_model_id_slug_unique_idx': 'This product slug already exists in this pricing model. Please choose a different slug.',
  'products_pricing_model_id_default_unique_idx': 'This pricing model already has a default product. Only one default product is allowed per pricing model.',
  'products_external_id_unique_idx': 'A product with this external ID already exists.',
  'products_slug_key': 'A product with this slug already exists. Please choose a different slug.',
  'products_organization_id_external_id_key': 'A product with this external ID already exists in your organization.',
  'products_pricing_model_id_fkey': 'The specified pricing model does not exist or is not accessible.',
  'products_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // CUSTOMERS CONSTRAINTS
  // ============================================
  'customers_organization_id_external_id_unique_idx': 'A customer with this external ID already exists in your organization.',
  'customers_organization_id_invoice_number_base_unique_idx': 'This invoice number base is already in use by another customer in your organization.',
  'customers_stripe_customer_id_unique_idx': 'This Stripe customer ID is already linked to another customer.',
  'customers_email_key': 'A customer with this email address already exists.',
  'customers_organization_id_email_livemode_idx': 'A customer with this email already exists in this environment.',
  'customers_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'customers_pricing_model_id_fkey': 'The specified pricing model does not exist or is not active.',
  
  // ============================================
  // PRICES CONSTRAINTS
  // ============================================
  'prices_product_id_slug_unique_idx': 'This price slug already exists for this product. Please choose a different slug.',
  'prices_product_id_is_default_unique_idx': 'This product already has a default price. Only one default price is allowed per product.',
  'prices_product_id_fkey': 'The specified product does not exist or is not available.',
  'prices_overage_price_id_fkey': 'The specified overage price does not exist.',
  'prices_usage_meter_id_fkey': 'The specified usage meter does not exist or is not configured.',
  
  // ============================================
  // SUBSCRIPTIONS CONSTRAINTS
  // ============================================
  'subscriptions_external_id_unique_idx': 'A subscription with this external ID already exists.',
  'subscriptions_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'subscriptions_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'subscriptions_payment_method_id_fkey': 'The specified payment method does not exist or is not valid.',
  'active_subscription_per_customer': 'This customer already has an active subscription. Cancel or modify the existing subscription first.',
  
  // ============================================
  // SUBSCRIPTION ITEMS CONSTRAINTS
  // ============================================
  'subscription_items_external_id_unique_idx': 'A subscription item with this external ID already exists.',
  'subscription_items_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  'subscription_items_price_id_fkey': 'The specified price does not exist or is not active.',
  
  // ============================================
  // INVOICES CONSTRAINTS
  // ============================================
  'invoices_invoice_number_unique_idx': 'An invoice with this number already exists. Invoice numbers must be unique.',
  'invoices_purchase_id_fkey': 'The specified purchase does not exist.',
  'invoices_billing_period_id_fkey': 'The specified billing period does not exist.',
  'invoices_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'invoices_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'invoices_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  'invoices_billing_run_id_fkey': 'The specified billing run does not exist.',
  'invoices_owner_membership_id_fkey': 'The specified membership does not exist.',
  
  // ============================================
  // INVOICE LINE ITEMS CONSTRAINTS
  // ============================================
  'invoice_line_items_invoice_id_fkey': 'The specified invoice does not exist.',
  'invoice_line_items_price_id_fkey': 'The specified price does not exist or is not active.',
  'invoice_line_items_billing_run_id_fkey': 'The specified billing run does not exist.',
  'invoice_line_items_ledger_account_id_fkey': 'The specified ledger account does not exist.',
  
  // ============================================
  // PAYMENT METHODS CONSTRAINTS
  // ============================================
  'payment_methods_external_id_unique_idx': 'A payment method with this external ID already exists.',
  'payment_methods_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'payment_methods_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // PAYMENTS CONSTRAINTS
  // ============================================
  'payments_stripe_charge_id_unique_idx': 'A payment with this Stripe charge ID already exists.',
  'payments_invoice_id_fkey': 'The specified invoice does not exist.',
  'payments_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'payments_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'payments_payment_method_id_fkey': 'The specified payment method does not exist or is not valid.',
  
  // ============================================
  // FEATURES CONSTRAINTS
  // ============================================
  'features_organization_id_slug_unique_idx': 'A feature with this slug already exists in your organization.',
  'features_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // PRODUCT FEATURES CONSTRAINTS
  // ============================================
  'product_features_product_id_feature_id_unique_idx': 'This feature is already linked to this product.',
  'product_features_product_id_fkey': 'The specified product does not exist or is not available.',
  'product_features_feature_id_fkey': 'The specified feature does not exist.',
  
  // ============================================
  // USAGE METERS CONSTRAINTS
  // ============================================
  'usage_meters_pricing_model_id_slug_unique_idx': 'A usage meter with this slug already exists in this pricing model.',
  'usage_meters_pricing_model_id_fkey': 'The specified pricing model does not exist or is not active.',
  'usage_meters_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // USAGE EVENTS CONSTRAINTS
  // ============================================
  'usage_events_idempotency_key_unique_idx': 'An event with this idempotency key already exists. Each event must have a unique key.',
  'usage_events_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'usage_events_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'usage_events_usage_meter_id_fkey': 'The specified usage meter does not exist or is not configured.',
  'usage_events_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  
  // ============================================
  // LEDGER ACCOUNTS CONSTRAINTS
  // ============================================
  'ledger_accounts_organization_id_subscription_id_usage_meter_id_unique_idx': 'A ledger account already exists for this subscription and usage meter combination.',
  'ledger_accounts_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'ledger_accounts_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  'ledger_accounts_usage_meter_id_fkey': 'The specified usage meter does not exist or is not configured.',
  
  // ============================================
  // LEDGER TRANSACTIONS CONSTRAINTS
  // ============================================
  'ledger_transactions_ledger_account_id_sequence_number_unique_idx': 'A transaction with this sequence number already exists for this ledger account.',
  'ledger_transactions_idempotency_key_unique_idx': 'A transaction with this idempotency key already exists.',
  'ledger_transactions_ledger_account_id_fkey': 'The specified ledger account does not exist.',
  
  // ============================================
  // LEDGER ENTRIES CONSTRAINTS
  // ============================================
  'ledger_entries_ledger_transaction_id_fkey': 'The specified ledger transaction does not exist.',
  'ledger_entries_ledger_account_id_fkey': 'The specified ledger account does not exist.',
  
  // ============================================
  // BILLING PERIODS CONSTRAINTS
  // ============================================
  'billing_periods_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  'billing_periods_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // BILLING PERIOD ITEMS CONSTRAINTS
  // ============================================
  'billing_period_items_billing_period_id_fkey': 'The specified billing period does not exist.',
  'billing_period_items_price_id_fkey': 'The specified price does not exist or is not active.',
  
  // ============================================
  // BILLING RUNS CONSTRAINTS
  // ============================================
  'billing_runs_billing_period_id_fkey': 'The specified billing period does not exist.',
  'billing_runs_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  'billing_runs_payment_method_id_fkey': 'The specified payment method does not exist or is not valid.',
  
  // ============================================
  // DISCOUNTS CONSTRAINTS
  // ============================================
  'discounts_code_unique_idx': 'A discount with this code already exists.',
  'discounts_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // DISCOUNT REDEMPTIONS CONSTRAINTS
  // ============================================
  'discount_redemptions_discount_id_fkey': 'The specified discount does not exist or has expired.',
  'discount_redemptions_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'discount_redemptions_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  
  // ============================================
  // PURCHASES CONSTRAINTS
  // ============================================
  'purchases_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'purchases_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'purchases_price_id_fkey': 'The specified price does not exist or is not active.',
  'purchases_payment_method_id_fkey': 'The specified payment method does not exist or is not valid.',
  
  // ============================================
  // PURCHASE ACCESS SESSIONS CONSTRAINTS
  // ============================================
  'purchase_access_sessions_token_unique_idx': 'A session with this token already exists.',
  'purchase_access_sessions_purchase_id_fkey': 'The specified purchase does not exist.',
  
  // ============================================
  // REFUNDS CONSTRAINTS
  // ============================================
  'refunds_payment_id_fkey': 'The specified payment does not exist or cannot be refunded.',
  'refunds_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // ORGANIZATIONS CONSTRAINTS
  // ============================================
  'organizations_external_id_unique_idx': 'An organization with this external ID already exists.',
  'organizations_slug_unique_idx': 'An organization with this slug already exists.',
  
  // ============================================
  // MEMBERSHIPS CONSTRAINTS
  // ============================================
  'memberships_user_id_organization_id_unique_idx': 'This user is already a member of this organization.',
  'memberships_user_id_fkey': 'The specified user does not exist.',
  'memberships_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // API KEYS CONSTRAINTS
  // ============================================
  'api_keys_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'api_keys_created_by_user_id_fkey': 'The specified user does not exist.',
  
  // ============================================
  // FILES CONSTRAINTS
  // ============================================
  'files_object_key_unique_idx': 'A file with this object key already exists.',
  'files_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'files_product_id_fkey': 'The specified product does not exist or is not available.',
  
  // ============================================
  // EVENTS CONSTRAINTS
  // ============================================
  'events_hash_unique_idx': 'An event with this hash already exists. This may be a duplicate event.',
  
  // ============================================
  // MESSAGES CONSTRAINTS
  // ============================================
  'messages_customer_id_slug_unique_idx': 'A message with this slug already exists for this customer.',
  'messages_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  
  // ============================================
  // PROPER NOUNS CONSTRAINTS
  // ============================================
  'proper_nouns_organization_id_entity_type_entity_id_unique_idx': 'A proper noun already exists for this entity.',
  'proper_nouns_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // WEBHOOKS CONSTRAINTS
  // ============================================
  'webhooks_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // CHECKOUT SESSIONS CONSTRAINTS
  // ============================================
  'checkout_sessions_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'checkout_sessions_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // COUNTRIES CONSTRAINTS
  // ============================================
  'countries_name_unique_idx': 'A country with this name already exists.',
  'countries_code_unique_idx': 'A country with this code already exists.',
  
  // ============================================
  // PRICING MODELS CONSTRAINTS
  // ============================================
  'pricing_models_organization_id_slug_unique_idx': 'A pricing model with this slug already exists in your organization.',
  'pricing_models_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'pricing_models_created_by_user_id_fkey': 'The specified user does not exist.',
  
  // ============================================
  // SUBSCRIPTION ITEM FEATURES CONSTRAINTS
  // ============================================
  'subscription_item_features_subscription_item_id_feature_id_unique_idx': 'This feature is already linked to this subscription item.',
  'subscription_item_features_subscription_item_id_fkey': 'The specified subscription item does not exist.',
  'subscription_item_features_feature_id_fkey': 'The specified feature does not exist.',
  
  // ============================================
  // SUBSCRIPTION METER PERIOD CALCULATIONS CONSTRAINTS
  // ============================================
  'subscription_meter_period_calculations_active_calculation_uq': 'An active calculation already exists for this subscription and meter period.',
  'subscription_meter_period_calculations_subscription_id_fkey': 'The specified subscription does not exist or has been cancelled.',
  'subscription_meter_period_calculations_usage_meter_id_fkey': 'The specified usage meter does not exist or is not configured.',
  
  // ============================================
  // USAGE CREDITS CONSTRAINTS
  // ============================================
  'usage_credits_ledger_account_id_fkey': 'The specified ledger account does not exist.',
  'usage_credits_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // USAGE CREDIT APPLICATIONS CONSTRAINTS
  // ============================================
  'usage_credit_applications_usage_credit_id_fkey': 'The specified usage credit does not exist or has been consumed.',
  'usage_credit_applications_usage_event_id_fkey': 'The specified usage event does not exist.',
  
  // ============================================
  // USAGE CREDIT BALANCE ADJUSTMENTS CONSTRAINTS
  // ============================================
  'usage_credit_balance_adjustments_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  'usage_credit_balance_adjustments_adjusted_usage_credit_id_fkey': 'The specified usage credit does not exist.',
  'usage_credit_balance_adjustments_adjusted_by_user_id_fkey': 'The specified user does not exist.',
  
  // ============================================
  // FEE CALCULATIONS CONSTRAINTS
  // ============================================
  'fee_calculations_invoice_id_fkey': 'The specified invoice does not exist.',
  'fee_calculations_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // ============================================
  // LINKS CONSTRAINTS
  // ============================================
  'links_customer_id_fkey': 'The specified customer does not exist or has been deleted.',
  'links_price_id_fkey': 'The specified price does not exist or is not active.',
  'links_organization_id_fkey': 'The specified organization does not exist or you don\'t have access to it.',
  
  // Generic patterns for common constraint types
  '_unique': {
    pattern: /(.+)_(.+)_unique$/,
    getMessage: (matches) => {
      const [, table, column] = matches
      const readableColumn = column.replace(/_/g, ' ')
      return `This ${readableColumn} already exists. Please choose a different value.`
    }
  },
  '_key': {
    pattern: /(.+)_(.+)_key$/,
    getMessage: (matches) => {
      const [, table, column] = matches
      const readableColumn = column.replace(/_/g, ' ')
      return `A record with this ${readableColumn} already exists.`
    }
  },
  '_fkey': {
    pattern: /(.+)_(.+)_fkey$/,
    getMessage: (matches) => {
      const [, table, column] = matches
      const readableColumn = column.replace(/_id$/, '').replace(/_/g, ' ')
      return `The specified ${readableColumn} does not exist or you don't have access to it.`
    }
  },
  '_check': {
    pattern: /(.+)_(.+)_check$/,
    getMessage: (matches) => {
      const [, table, column] = matches
      const readableColumn = column.replace(/_/g, ' ')
      return `The ${readableColumn} value does not meet the required criteria.`
    }
  }
}

// Enhanced foreign key message mapping
const FOREIGN_KEY_FIELD_MESSAGES: Record<string, string> = {
  'customer_id': 'The specified customer does not exist or has been deleted.',
  'organization_id': 'The specified organization does not exist or you don\'t have access to it.',
  'product_id': 'The specified product does not exist or is not available.',
  'price_id': 'The specified price does not exist or is not active.',
  'subscription_id': 'The specified subscription does not exist or has been cancelled.',
  'pricing_model_id': 'The specified pricing model does not exist or is not active.',
  'usage_meter_id': 'The specified usage meter does not exist or is not configured.',
  'invoice_id': 'The specified invoice does not exist.',
  'billing_period_id': 'The specified billing period does not exist.',
  'payment_method_id': 'The specified payment method does not exist or is not valid.',
  'user_id': 'The specified user does not exist.',
  'created_by_user_id': 'The specified user does not exist.',
  'feature_id': 'The specified feature does not exist.',
  'discount_id': 'The specified discount does not exist or has expired.',
  'purchase_id': 'The specified purchase does not exist.',
  'payment_id': 'The specified payment does not exist.',
  'ledger_account_id': 'The specified ledger account does not exist.',
  'ledger_transaction_id': 'The specified ledger transaction does not exist.',
  'usage_credit_id': 'The specified usage credit does not exist or has been consumed.',
  'usage_event_id': 'The specified usage event does not exist.',
  'membership_id': 'The specified membership does not exist.',
  'billing_run_id': 'The specified billing run does not exist.',
  'subscription_item_id': 'The specified subscription item does not exist.',
  'overage_price_id': 'The specified overage price does not exist.',
}

// RLS (Row-Level Security) error patterns
const RLS_ERROR_PATTERNS: Record<string, {
  pattern: RegExp
  userMessage: string
  internalNote: string
}> = {
  'organization_membership': {
    pattern: /row-level security.*memberships|permission denied.*organization/i,
    userMessage: 'This operation could not be completed. Please ensure you have the necessary permissions.',
    internalNote: 'RLS: Organization membership check failed'
  },
  'customer_access': {
    pattern: /row-level security.*customers|permission denied.*customer/i,
    userMessage: 'This customer record either does not exist or you do not have access to it.',
    internalNote: 'RLS: Customer organization access denied'
  },
  'livemode_mismatch': {
    pattern: /row-level security.*livemode|Check mode/i,
    userMessage: 'This operation cannot be performed in the current environment mode.',
    internalNote: 'RLS: Livemode mismatch - attempting to access different environment data'
  },
  'subscription_access': {
    pattern: /row-level security.*subscriptions/i,
    userMessage: 'Unable to access this subscription. Please verify your permissions.',
    internalNote: 'RLS: Subscription access denied'
  },
  'product_access': {
    pattern: /row-level security.*products/i,
    userMessage: 'Unable to access this product. Please verify your organization permissions.',
    internalNote: 'RLS: Product organization access denied'
  },
  'invoice_access': {
    pattern: /row-level security.*invoices/i,
    userMessage: 'Unable to access this invoice. Please verify your permissions.',
    internalNote: 'RLS: Invoice access denied'
  },
  'delete_forbidden': {
    pattern: /row-level security.*delete|Forbid deletion|Disallow deletion/i,
    userMessage: 'This item cannot be deleted. Please contact support if you need to remove this record.',
    internalNote: 'RLS: Deletion is forbidden by policy'
  },
  'generic_rls': {
    pattern: /row-level security|permission denied for (table|schema)/i,
    userMessage: 'This operation could not be completed due to security restrictions. Please contact support if you believe this is an error.',
    internalNote: 'RLS: Generic policy violation'
  }
}

// Check constraint patterns
const CHECK_CONSTRAINTS: Record<string, string> = {
  'positive_amount_check': 'The amount must be a positive value.',
  'valid_percentage_check': 'The percentage must be between 0 and 100.',
  'valid_date_range_check': 'The end date must be after the start date.',
  'non_empty_string_check': 'This field cannot be empty.',
  'valid_email_check': 'Please provide a valid email address.',
  'valid_url_check': 'Please provide a valid URL.',
  'valid_currency_check': 'The currency code is not valid.',
}

// Resource-specific helpful context
const RESOURCE_HELPFUL_CONTEXT: Record<string, Record<string, string>> = {
  'products': {
    'slug_conflict': 'Tip: Product slugs must be unique within each pricing model. Consider adding a number or variation to make it unique.',
    'default_conflict': 'Tip: Use the "Set as Default" option on an existing product instead of creating a new default.',
    'external_id_conflict': 'Tip: External IDs are used for integration with external systems. Ensure they are unique across your organization.',
  },
  'customers': {
    'email_conflict': 'Tip: This email is already registered. You can search for the existing customer or use a different email.',
    'external_id_conflict': 'Tip: External IDs must be unique. If migrating data, ensure IDs don\'t conflict with existing records.',
    'stripe_id_conflict': 'Tip: This Stripe customer is already linked. Check if you\'re trying to create a duplicate customer.',
  },
  'subscriptions': {
    'active_conflict': 'Tip: Cancel or pause the existing subscription before creating a new one for this customer.',
    'payment_method_missing': 'Tip: Ensure the customer has a valid payment method before creating a subscription.',
  },
  'prices': {
    'slug_conflict': 'Tip: Price slugs must be unique within each product. Consider using descriptive names like "monthly-pro" or "annual-basic".',
    'default_conflict': 'Tip: Each product can have only one default price. Update the existing default price or remove its default status first.',
  },
  'invoices': {
    'number_conflict': 'Tip: Invoice numbers must be unique. Consider using a sequential numbering system or adding a prefix.',
  },
  'features': {
    'slug_conflict': 'Tip: Feature slugs are used in API calls. Use lowercase with hyphens, like "api-access" or "priority-support".',
  },
}

// Map PostgreSQL error codes to user-friendly messages
const ERROR_CODE_MESSAGES: Record<string, string | ((error: PostgresError) => string)> = {
  // Integrity Constraint Violations
  '23505': (error: PostgresError) => {
    // Unique violation - try to get more specific message from constraint
    if (error.constraint_name) {
      const constraintMessage = getConstraintMessage(error.constraint_name, error)
      if (constraintMessage) return constraintMessage
    }
    return 'This item already exists. Please use a different identifier.'
  },
  '23503': (error: PostgresError) => {
    // Foreign key violation
    if (error.constraint_name) {
      const constraintMessage = getConstraintMessage(error.constraint_name, error)
      if (constraintMessage) return constraintMessage
    }
    // Try to get a better message from the column name
    if (error.column_name && FOREIGN_KEY_FIELD_MESSAGES[error.column_name]) {
      return FOREIGN_KEY_FIELD_MESSAGES[error.column_name]
    }
    return 'This operation references data that does not exist or you don\'t have access to.'
  },
  '23502': 'A required field is missing. Please provide all required information.',
  '23514': (error: PostgresError) => {
    // Check constraint violation
    if (error.constraint_name) {
      const constraintMessage = getConstraintMessage(error.constraint_name, error)
      if (constraintMessage) return constraintMessage
    }
    return 'The provided data does not meet validation requirements.'
  },
  
  // Data Exception
  '22001': 'The provided text is too long. Please shorten your input.',
  '22003': 'The number provided is out of range.',
  '22007': 'Invalid date format. Please provide a valid date.',
  '22P02': 'Invalid text representation. Please check your input format.',
  '22012': 'Division by zero error.',
  '22005': 'Error in assignment. The value type doesn\'t match the expected type.',
  
  // Access Rule Violations - RLS
  '42501': (error: PostgresError) => {
    // Permission denied - check for RLS patterns
    const errorMessage = error.message || ''
    const errorDetail = error.detail || ''
    const fullError = `${errorMessage} ${errorDetail}`.toLowerCase()
    
    for (const [key, rlsPattern] of Object.entries(RLS_ERROR_PATTERNS)) {
      if (rlsPattern.pattern.test(fullError)) {
        // Log the internal note for debugging but return user-friendly message
        // console.log(`[RLS Error] ${rlsPattern.internalNote}`)
        return rlsPattern.userMessage
      }
    }
    
    return 'You do not have permission to perform this operation.'
  },
  '42P01': 'The requested table or resource does not exist.',
  '42703': 'The specified column does not exist.',
  '42883': 'The requested function or operation does not exist.',
  '42P02': 'Invalid parameter reference.',
  
  // Connection Exceptions
  '08003': 'Database connection does not exist.',
  '08006': 'Database connection failure. Please try again.',
  '08001': 'Unable to connect to the database. Please try again later.',
  '08004': 'Database connection rejected. Please check your credentials.',
  
  // Transaction Rollback
  '40001': 'Operation failed due to concurrent update. Please try again.',
  '40P01': 'Deadlock detected. Please retry your operation.',
  
  // Syntax Errors
  '42601': 'Invalid query syntax.',
  '42804': 'Datatype mismatch in the query.',
  
  // Insufficient Resources
  '53000': 'Insufficient resources to complete the operation.',
  '53100': 'Disk full. Please contact support.',
  '53200': 'Out of memory. Please try again with less data.',
  '53300': 'Too many database connections. Please try again later.',
  
  // Operator Intervention
  '57014': 'Query was cancelled. Please try again.',
  
  // System Error
  '58000': 'System error. Please contact support.',
  '58030': 'IO error. Please try again.',
  
  // Configuration File Error
  'F0000': 'Configuration file error. Please contact support.',
  
  // Foreign Data Wrapper Error
  'HV000': 'Foreign data wrapper error. Please check external connections.',
}

/**
 * Get a user-friendly message for a constraint name
 */
function getConstraintMessage(constraintName: string, error: PostgresError): string | null {
  // Check for exact match
  if (CONSTRAINT_MESSAGES[constraintName]) {
    const mapping = CONSTRAINT_MESSAGES[constraintName]
    if (typeof mapping === 'string') {
      return mapping
    }
  }
  
  // Check for pattern matches
  for (const [key, mapping] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (typeof mapping === 'object' && 'pattern' in mapping) {
      const matches = constraintName.match(mapping.pattern)
      if (matches) {
        return mapping.getMessage(matches, error)
      }
    }
  }
  
  // Try to infer from constraint name
  if (constraintName.includes('unique')) {
    const field = constraintName.split('_').slice(1, -1).join(' ')
    return `This ${field} already exists. Please choose a different value.`
  }
  
  if (constraintName.includes('fkey')) {
    const field = constraintName.split('_').slice(1, -1).join(' ').replace(/id$/, '')
    return `The specified ${field} does not exist or is invalid.`
  }
  
  if (constraintName.includes('check')) {
    const field = constraintName.split('_').slice(0, -1).join(' ')
    return `The ${field} value does not meet the required criteria.`
  }
  
  return null
}

/**
 * Get helpful context for specific error scenarios
 */
function getHelpfulContext(error: PostgresError): string | null {
  if (!error.table_name || !error.constraint_name) return null
  
  const table = error.table_name
  const constraint = error.constraint_name
  
  if (RESOURCE_HELPFUL_CONTEXT[table]) {
    if (constraint.includes('slug') && RESOURCE_HELPFUL_CONTEXT[table]['slug_conflict']) {
      return RESOURCE_HELPFUL_CONTEXT[table]['slug_conflict']
    }
    if (constraint.includes('default') && RESOURCE_HELPFUL_CONTEXT[table]['default_conflict']) {
      return RESOURCE_HELPFUL_CONTEXT[table]['default_conflict']
    }
    if (constraint.includes('external_id') && RESOURCE_HELPFUL_CONTEXT[table]['external_id_conflict']) {
      return RESOURCE_HELPFUL_CONTEXT[table]['external_id_conflict']
    }
    if (constraint.includes('email') && RESOURCE_HELPFUL_CONTEXT[table]['email_conflict']) {
      return RESOURCE_HELPFUL_CONTEXT[table]['email_conflict']
    }
  }
  
  return null
}

/**
 * Parse a PostgreSQL error and return a user-friendly message
 */
export function parsePostgresError(error: unknown): {
  userMessage: string
  technicalDetails: Record<string, any>
  isRetryable: boolean
  helpfulContext?: string
} {
  // Default response
  let userMessage = 'An unexpected database error occurred. Please try again.'
  let technicalDetails: Record<string, any> = {}
  let isRetryable = false
  let helpfulContext: string | undefined
  
  // Check if this is a PostgreSQL error
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as PostgresError
    technicalDetails = {
      code: pgError.code,
      constraint: pgError.constraint_name,
      table: pgError.table_name,
      column: pgError.column_name,
      detail: pgError.detail,
      hint: pgError.hint,
    }
    
    // Get message from error code
    if (pgError.code && ERROR_CODE_MESSAGES[pgError.code]) {
      const messageOrFunc = ERROR_CODE_MESSAGES[pgError.code]
      if (typeof messageOrFunc === 'function') {
        userMessage = messageOrFunc(pgError)
      } else {
        userMessage = messageOrFunc
      }
    }
    
    // Get helpful context if available
    const context = getHelpfulContext(pgError)
    if (context) {
      helpfulContext = context
    }
    
    // Check if error is retryable
    isRetryable = ['40001', '40P01', '08006', '53300', '57014'].includes(pgError.code || '')
  }
  
  // Check for specific error patterns in the message
  if (error instanceof Error) {
    // Extract slug information from the error for better context
    if (error.message.includes('slug') || error.message.includes('duplicate')) {
      const slugMatch = error.message.match(/"slug"\s*=\s*\$\d+.*params:.*?,\s*'([^']+)'/i)
      if (slugMatch) {
        technicalDetails.attemptedSlug = slugMatch[1]
        if (userMessage.includes('slug')) {
          userMessage = userMessage.replace('slug', `slug "${slugMatch[1]}"`)
        }
      }
    }
    
    // Extract product name for context
    if (error.message.includes('products')) {
      const nameMatch = error.message.match(/"name"\s*=\s*\$\d+.*params:.*?,\s*'([^']+)'/i)
      if (nameMatch) {
        technicalDetails.productName = nameMatch[1]
      }
    }
    
    // Extract email for context
    if (error.message.includes('email')) {
      const emailMatch = error.message.match(/"email"\s*=\s*\$\d+.*params:.*?,\s*'([^']+)'/i)
      if (emailMatch) {
        technicalDetails.attemptedEmail = emailMatch[1]
      }
    }
  }
  
  return {
    userMessage,
    technicalDetails,
    isRetryable,
    helpfulContext
  }
}

/**
 * Check if an error is a PostgreSQL error
 */
export function isPostgresError(error: unknown): boolean {
  return !!(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as any).code === 'string' &&
    /^\d{5}$/.test((error as any).code)
  )
}

/**
 * Extract the root PostgreSQL error from a nested error
 */
export function extractPostgresError(error: unknown): PostgresError | null {
  if (isPostgresError(error)) {
    return error as PostgresError
  }
  
  // Check the cause chain
  let current = error
  while (current && typeof current === 'object' && 'cause' in current) {
    if (isPostgresError((current as any).cause)) {
      return (current as any).cause as PostgresError
    }
    current = (current as any).cause
  }
  
  return null
}

/**
 * Check if the error is an RLS (Row-Level Security) error
 */
export function isRLSError(error: unknown): boolean {
  const pgError = extractPostgresError(error)
  if (!pgError) return false
  
  // Check for permission denied code
  if (pgError.code === '42501') return true
  
  // Check for RLS patterns in the error message
  const errorMessage = (pgError.message || '').toLowerCase()
  const errorDetail = (pgError.detail || '').toLowerCase()
  const fullError = `${errorMessage} ${errorDetail}`
  
  return /row-level security|permission denied for (table|schema)|check mode/i.test(fullError)
}