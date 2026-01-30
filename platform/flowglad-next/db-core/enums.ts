/**
 * Enums used by database schemas.
 * These are extracted to db-core to enable subtree sharing with flowglad-internal.
 * This file has no external dependencies.
 */

export enum IntervalUnit {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  Year = 'year',
}

export enum CountryCode {
  AD = 'AD', // Andorra
  AE = 'AE', // United Arab Emirates
  AF = 'AF', // Afghanistan
  AG = 'AG', // Antigua and Barbuda
  AI = 'AI', // Anguilla
  AL = 'AL', // Albania
  AM = 'AM', // Armenia
  AO = 'AO', // Angola
  AQ = 'AQ', // Antarctica
  AR = 'AR', // Argentina
  AS = 'AS', // American Samoa
  AT = 'AT', // Austria
  AU = 'AU', // Australia
  AW = 'AW', // Aruba
  AX = 'AX', // Åland Islands
  AZ = 'AZ', // Azerbaijan
  BA = 'BA', // Bosnia and Herzegovina
  BB = 'BB', // Barbados
  BD = 'BD', // Bangladesh
  BE = 'BE', // Belgium
  BF = 'BF', // Burkina Faso
  BG = 'BG', // Bulgaria
  BH = 'BH', // Bahrain
  BI = 'BI', // Burundi
  BJ = 'BJ', // Benin
  BL = 'BL', // Saint Barthélemy
  BM = 'BM', // Bermuda
  BN = 'BN', // Brunei Darussalam
  BO = 'BO', // Bolivia
  BQ = 'BQ', // Bonaire, Sint Eustatius and Saba
  BR = 'BR', // Brazil
  BS = 'BS', // Bahamas
  BT = 'BT', // Bhutan
  BV = 'BV', // Bouvet Island
  BW = 'BW', // Botswana
  BY = 'BY', // Belarus
  BZ = 'BZ', // Belize
  CA = 'CA', // Canada
  CC = 'CC', // Cocos (Keeling) Islands
  CD = 'CD', // Congo, the Democratic Republic of the
  CF = 'CF', // Central African Republic
  CG = 'CG', // Congo
  CH = 'CH', // Switzerland
  CI = 'CI', // Cote D'Ivoire
  CK = 'CK', // Cook Islands
  CL = 'CL', // Chile
  CM = 'CM', // Cameroon
  CN = 'CN', // China
  CO = 'CO', // Colombia
  CR = 'CR', // Costa Rica
  CU = 'CU', // Cuba
  CV = 'CV', // Cape Verde
  CW = 'CW', // Curaçao
  CX = 'CX', // Christmas Island
  CY = 'CY', // Cyprus
  CZ = 'CZ', // Czech Republic
  DE = 'DE', // Germany
  DJ = 'DJ', // Djibouti
  DK = 'DK', // Denmark
  DM = 'DM', // Dominica
  DO = 'DO', // Dominican Republic
  DZ = 'DZ', // Algeria
  EC = 'EC', // Ecuador
  EE = 'EE', // Estonia
  EG = 'EG', // Egypt
  EH = 'EH', // Western Sahara
  ER = 'ER', // Eritrea
  ES = 'ES', // Spain
  ET = 'ET', // Ethiopia
  FI = 'FI', // Finland
  FJ = 'FJ', // Fiji
  FK = 'FK', // Falkland Islands (Malvinas)
  FM = 'FM', // Micronesia, Federated States of
  FO = 'FO', // Faroe Islands
  FR = 'FR', // France
  GA = 'GA', // Gabon
  GB = 'GB', // United Kingdom
  GD = 'GD', // Grenada
  GE = 'GE', // Georgia
  GF = 'GF', // French Guiana
  GG = 'GG', // Guernsey
  GH = 'GH', // Ghana
  GI = 'GI', // Gibraltar
  GL = 'GL', // Greenland
  GM = 'GM', // Gambia
  GN = 'GN', // Guinea
  GP = 'GP', // Guadeloupe
  GQ = 'GQ', // Equatorial Guinea
  GR = 'GR', // Greece
  GS = 'GS', // South Georgia and the South Sandwich Islands
  GT = 'GT', // Guatemala
  GU = 'GU', // Guam
  GW = 'GW', // Guinea-Bissau
  GY = 'GY', // Guyana
  HK = 'HK', // Hong Kong
  HM = 'HM', // Heard Island and Mcdonald Islands
  HN = 'HN', // Honduras
  HR = 'HR', // Croatia
  HT = 'HT', // Haiti
  HU = 'HU', // Hungary
  ID = 'ID', // Indonesia
  IE = 'IE', // Ireland
  IL = 'IL', // Israel
  IM = 'IM', // Isle of Man
  IN = 'IN', // India
  IO = 'IO', // British Indian Ocean Territory
  IQ = 'IQ', // Iraq
  IR = 'IR', // Iran, Islamic Republic of
  IS = 'IS', // Iceland
  IT = 'IT', // Italy
  JE = 'JE', // Jersey
  JM = 'JM', // Jamaica
  JO = 'JO', // Jordan
  JP = 'JP', // Japan
  KE = 'KE', // Kenya
  KG = 'KG', // Kyrgyzstan
  KH = 'KH', // Cambodia
  KI = 'KI', // Kiribati
  KM = 'KM', // Comoros
  KN = 'KN', // Saint Kitts and Nevis
  KP = 'KP', // Korea, Democratic People's Republic of
  KR = 'KR', // Korea, Republic of
  KW = 'KW', // Kuwait
  KY = 'KY', // Cayman Islands
  KZ = 'KZ', // Kazakhstan
  LA = 'LA', // Lao People's Democratic Republic
  LB = 'LB', // Lebanon
  LC = 'LC', // Saint Lucia
  LI = 'LI', // Liechtenstein
  LK = 'LK', // Sri Lanka
  LR = 'LR', // Liberia
  LS = 'LS', // Lesotho
  LT = 'LT', // Lithuania
  LU = 'LU', // Luxembourg
  LV = 'LV', // Latvia
  LY = 'LY', // Libyan Arab Jamahiriya
  MA = 'MA', // Morocco
  MC = 'MC', // Monaco
  MD = 'MD', // Moldova, Republic of
  ME = 'ME', // Montenegro
  MF = 'MF', // Saint Martin (French part)
  MG = 'MG', // Madagascar
  MH = 'MH', // Marshall Islands
  MK = 'MK', // Macedonia, the Former Yugoslav Republic of
  ML = 'ML', // Mali
  MM = 'MM', // Myanmar
  MN = 'MN', // Mongolia
  MO = 'MO', // Macao
  MP = 'MP', // Northern Mariana Islands
  MQ = 'MQ', // Martinique
  MR = 'MR', // Mauritania
  MS = 'MS', // Montserrat
  MT = 'MT', // Malta
  MU = 'MU', // Mauritius
  MV = 'MV', // Maldives
  MW = 'MW', // Malawi
  MX = 'MX', // Mexico
  MY = 'MY', // Malaysia
  MZ = 'MZ', // Mozambique
  NA = 'NA', // Namibia
  NC = 'NC', // New Caledonia
  NE = 'NE', // Niger
  NF = 'NF', // Norfolk Island
  NG = 'NG', // Nigeria
  NI = 'NI', // Nicaragua
  NL = 'NL', // Netherlands
  NO = 'NO', // Norway
  NP = 'NP', // Nepal
  NR = 'NR', // Nauru
  NU = 'NU', // Niue
  NZ = 'NZ', // New Zealand
  OM = 'OM', // Oman
  PA = 'PA', // Panama
  PE = 'PE', // Peru
  PF = 'PF', // French Polynesia
  PG = 'PG', // Papua New Guinea
  PH = 'PH', // Philippines
  PK = 'PK', // Pakistan
  PL = 'PL', // Poland
  PM = 'PM', // Saint Pierre and Miquelon
  PN = 'PN', // Pitcairn
  PR = 'PR', // Puerto Rico
  PS = 'PS', // Palestinian Territory, Occupied
  PT = 'PT', // Portugal
  PW = 'PW', // Palau
  PY = 'PY', // Paraguay
  QA = 'QA', // Qatar
  RE = 'RE', // Reunion
  RO = 'RO', // Romania
  RS = 'RS', // Serbia
  RU = 'RU', // Russian Federation
  RW = 'RW', // Rwanda
  SA = 'SA', // Saudi Arabia
  SB = 'SB', // Solomon Islands
  SC = 'SC', // Seychelles
  SD = 'SD', // Sudan
  SE = 'SE', // Sweden
  SG = 'SG', // Singapore
  SH = 'SH', // Saint Helena
  SI = 'SI', // Slovenia
  SJ = 'SJ', // Svalbard and Jan Mayen
  SK = 'SK', // Slovakia
  SL = 'SL', // Sierra Leone
  SM = 'SM', // San Marino
  SN = 'SN', // Senegal
  SO = 'SO', // Somalia
  SR = 'SR', // Suriname
  SS = 'SS', // South Sudan
  ST = 'ST', // Sao Tome and Principe
  SV = 'SV', // El Salvador
  SX = 'SX', // Sint Maarten (Dutch part)
  SY = 'SY', // Syrian Arab Republic
  SZ = 'SZ', // Swaziland
  TC = 'TC', // Turks and Caicos Islands
  TD = 'TD', // Chad
  TF = 'TF', // French Southern Territories
  TG = 'TG', // Togo
  TH = 'TH', // Thailand
  TJ = 'TJ', // Tajikistan
  TK = 'TK', // Tokelau
  TL = 'TL', // Timor-Leste
  TM = 'TM', // Turkmenistan
  TN = 'TN', // Tunisia
  TO = 'TO', // Tonga
  TR = 'TR', // Turkey
  TT = 'TT', // Trinidad and Tobago
  TV = 'TV', // Tuvalu
  TW = 'TW', // Taiwan, Province of China
  TZ = 'TZ', // Tanzania, United Republic of
  UA = 'UA', // Ukraine
  UG = 'UG', // Uganda
  UM = 'UM', // United States Minor Outlying Islands
  US = 'US', // United States
  UY = 'UY', // Uruguay
  UZ = 'UZ', // Uzbekistan
  VA = 'VA', // Holy See (Vatican City State)
  VC = 'VC', // Saint Vincent and the Grenadines
  VE = 'VE', // Venezuela
  VG = 'VG', // Virgin Islands, British
  VI = 'VI', // Virgin Islands, U.s.
  VN = 'VN', // Viet Nam
  VU = 'VU', // Vanuatu
  WF = 'WF', // Wallis and Futuna
  WS = 'WS', // Samoa
  XK = 'XK', // Kosovo (not officially ISO 3166-1, but often included)
  YE = 'YE', // Yemen
  YT = 'YT', // Mayotte
  ZA = 'ZA', // South Africa
  ZM = 'ZM', // Zambia
  ZW = 'ZW', // Zimbabwe
}

export enum CurrencyCode {
  USD = 'USD',
  AED = 'AED',
  AFN = 'AFN',
  ALL = 'ALL',
  AMD = 'AMD',
  ANG = 'ANG',
  AOA = 'AOA',
  ARS = 'ARS',
  AUD = 'AUD',
  AWG = 'AWG',
  AZN = 'AZN',
  BAM = 'BAM',
  BBD = 'BBD',
  BDT = 'BDT',
  BGN = 'BGN',
  BIF = 'BIF',
  BMD = 'BMD',
  BND = 'BND',
  BOB = 'BOB',
  BRL = 'BRL',
  BSD = 'BSD',
  BWP = 'BWP',
  BYN = 'BYN',
  BZD = 'BZD',
  CAD = 'CAD',
  CDF = 'CDF',
  CHF = 'CHF',
  CLP = 'CLP',
  CNY = 'CNY',
  COP = 'COP',
  CRC = 'CRC',
  CVE = 'CVE',
  CZK = 'CZK',
  DJF = 'DJF',
  DKK = 'DKK',
  DOP = 'DOP',
  DZD = 'DZD',
  EGP = 'EGP',
  ETB = 'ETB',
  EUR = 'EUR',
  FJD = 'FJD',
  FKP = 'FKP',
  GBP = 'GBP',
  GEL = 'GEL',
  GIP = 'GIP',
  GMD = 'GMD',
  GNF = 'GNF',
  GTQ = 'GTQ',
  GYD = 'GYD',
  HKD = 'HKD',
  HNL = 'HNL',
  HTG = 'HTG',
  HUF = 'HUF',
  IDR = 'IDR',
  ILS = 'ILS',
  INR = 'INR',
  ISK = 'ISK',
  JMD = 'JMD',
  JPY = 'JPY',
  KES = 'KES',
  KGS = 'KGS',
  KHR = 'KHR',
  KMF = 'KMF',
  KRW = 'KRW',
  KYD = 'KYD',
  KZT = 'KZT',
  LAK = 'LAK',
  LBP = 'LBP',
  LKR = 'LKR',
  LRD = 'LRD',
  LSL = 'LSL',
  MAD = 'MAD',
  MDL = 'MDL',
  MGA = 'MGA',
  MKD = 'MKD',
  MMK = 'MMK',
  MNT = 'MNT',
  MOP = 'MOP',
  MUR = 'MUR',
  MVR = 'MVR',
  MWK = 'MWK',
  MXN = 'MXN',
  MYR = 'MYR',
  MZN = 'MZN',
  NAD = 'NAD',
  NGN = 'NGN',
  NIO = 'NIO',
  NOK = 'NOK',
  NPR = 'NPR',
  NZD = 'NZD',
  PAB = 'PAB',
  PEN = 'PEN',
  PGK = 'PGK',
  PHP = 'PHP',
  PKR = 'PKR',
  PLN = 'PLN',
  PYG = 'PYG',
  QAR = 'QAR',
  RON = 'RON',
  RSD = 'RSD',
  RUB = 'RUB',
  RWF = 'RWF',
  SAR = 'SAR',
  SBD = 'SBD',
  SCR = 'SCR',
  SEK = 'SEK',
  SGD = 'SGD',
  SHP = 'SHP',
  SLE = 'SLE',
  SOS = 'SOS',
  SRD = 'SRD',
  STD = 'STD',
  SZL = 'SZL',
  THB = 'THB',
  TJS = 'TJS',
  TOP = 'TOP',
  TRY = 'TRY',
  TTD = 'TTD',
  TWD = 'TWD',
  TZS = 'TZS',
  UAH = 'UAH',
  UGX = 'UGX',
  UYU = 'UYU',
  UZS = 'UZS',
  VND = 'VND',
  VUV = 'VUV',
  WST = 'WST',
  XAF = 'XAF',
  XCD = 'XCD',
  XOF = 'XOF',
  XPF = 'XPF',
  YER = 'YER',
  ZAR = 'ZAR',
  ZMW = 'ZMW',
}

export enum PriceType {
  SinglePayment = 'single_payment',
  Subscription = 'subscription',
  Usage = 'usage',
}

export enum SupabasePayloadType {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export enum PaymentMethodType {
  Card = 'card',
  Link = 'link',
  USBankAccount = 'us_bank_account',
  SEPADebit = 'sepa_debit',
}

export enum SubscriptionStatus {
  /**
   * Used for time based subscriptions
   */
  Trialing = 'trialing',
  /**
   * Used for usage based subscriptions
   * @deprecated Use `Active` instead
   */
  CreditTrial = 'credit_trial',
  Active = 'active',
  PastDue = 'past_due',
  Unpaid = 'unpaid',
  CancellationScheduled = 'cancellation_scheduled',
  /**
   * Non-current states
   */
  Incomplete = 'incomplete',
  /**
   * Terminal states
   */
  IncompleteExpired = 'incomplete_expired',
  Canceled = 'canceled',
  Paused = 'paused',
}

export enum TaxType {
  AmusementTax = 'amusement_tax',
  CommunicationsTax = 'communications_tax',
  GST = 'gst',
  HST = 'hst',
  IGST = 'igst',
  JCT = 'jct',
  ChicagoLeaseTax = 'lease_tax',
  PST = 'pst',
  QST = 'qst',
  RST = 'rst',
  SalesTax = 'sales_tax',
  VAT = 'vat',
  None = 'none',
}

export enum BusinessOnboardingStatus {
  FullyOnboarded = 'fully_onboarded',
  PartiallyOnboarded = 'partially_onboarded',
  Unauthorized = 'unauthorized',
  Expired = 'expired',
}

export enum PurchaseStatus {
  Open = 'open',
  Pending = 'pending',
  Failed = 'failed',
  Paid = 'paid',
  Refunded = 'refunded',
  PartialRefund = 'partial_refund',
  Fraudulent = 'fraudulent',
}

export enum FlowgladEventType {
  CustomerCreated = 'customer.created',
  CustomerUpdated = 'customer.updated',
  PurchaseCompleted = 'purchase.completed',
  PaymentFailed = 'payment.failed',
  PaymentSucceeded = 'payment.succeeded',
  SubscriptionCreated = 'subscription.created',
  SubscriptionUpdated = 'subscription.updated',
  SubscriptionCanceled = 'subscription.canceled',
  /**
   * Notification that new events are available in the sync stream.
   * Merchants subscribe to this event type to receive real-time notifications
   * when events are added to their sync stream for consumption.
   */
  SyncEventsAvailable = 'sync.events_available',
}

export enum EventNoun {
  Customer = 'customer',
  User = 'user',
  Purchase = 'purchase',
  Invoice = 'invoice',
  Payment = 'payment',
  Product = 'product',
  Subscription = 'subscription',
  SyncStream = 'sync_stream',
}

export enum DiscountAmountType {
  Percent = 'percent',
  Fixed = 'fixed',
}

export enum DiscountDuration {
  Once = 'once',
  Forever = 'forever',
  NumberOfPayments = 'number_of_payments',
}

export enum FlowgladApiKeyType {
  Publishable = 'publishable',
  Secret = 'secret',
}

export enum StripeConnectContractType {
  Platform = 'platform',
  MerchantOfRecord = 'merchant_of_record',
}

export enum MembershipRole {
  Owner = 'owner',
  Member = 'member',
}

export enum BillingPeriodStatus {
  Upcoming = 'upcoming',
  Active = 'active',
  Completed = 'completed',
  Canceled = 'canceled',
  PastDue = 'past_due',
  ScheduledToCancel = 'scheduled_to_cancel',
}

export enum BillingRunStatus {
  Scheduled = 'scheduled',
  InProgress = 'started',
  AwaitingPaymentConfirmation = 'awaiting_payment_confirmation',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Abandoned = 'abandoned',
  Aborted = 'aborted',
}

export enum SubscriptionMeterPeriodCalculationStatus {
  Active = 'active',
  Superseded = 'superseded',
  PendingConfirmation = 'pending_confirmation',
}

export enum CheckoutSessionType {
  Product = 'product',
  Purchase = 'purchase',
  AddPaymentMethod = 'add_payment_method',
  ActivateSubscription = 'activate_subscription',
}

export enum UsageMeterAggregationType {
  Sum = 'sum',
  CountDistinctProperties = 'count_distinct_properties',
}

export enum UsageCreditApplicationStatus {
  Pending = 'pending',
  Posted = 'posted',
}

export enum RefundStatus {
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export enum FeatureType {
  Toggle = 'toggle',
  UsageCreditGrant = 'usage_credit_grant',
  Resource = 'resource',
}

export enum FeatureUsageGrantFrequency {
  Once = 'once',
  EveryBillingPeriod = 'every_billing_period',
}

export enum NormalBalanceType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

export enum LedgerTransactionType {
  /**
   * Transactions that reflect the emission of a usage event.
   * Includes both the usage event, and if necesssary,
   * any consumptions of usage credits in the process.
   */
  UsageEventProcessed = 'usage_event_processed',
  /**
   * Two sources of credit grants:
   * 1. Promotional grants, or initial trial grants - essentially "admin" grants
   * 2. Grants given as a result of a pay-as-you-go payment.
   */
  CreditGrantRecognized = 'credit_grant_recognized',
  /**
   * Transactions that reflect a change of billing periods for a subscription.
   * Typically, these will include:
   * - credit grants for the new period
   * - expirations of unused credits from the previous period
   * - charges to settle any outstanding usage costs from the previous period
   */
  BillingPeriodTransition = 'billing_period_transition',
  /**
   * Any admin actions by the organization to adjust their ledger.
   * Should be used sparingly, and only in cases where there is no more meaningful
   * narration of the transaction.
   * Use BillingRecalculated whenever possible.
   */
  AdminCreditAdjusted = 'admin_credit_adjusted',
  /**
   * Transactions that reflect an out-of-billing period credit grant expiration.
   * These are currently unused but present for future use.
   */
  CreditGrantExpired = 'credit_grant_expired',
  /**
   * Transactions that reflect a payment refund. Will include a debit of
   * outstanding usage credits, based on the refund policy.
   */
  PaymentRefunded = 'payment_refunded',
  /**
   * A transaction to correct the record for a prior billing event or
   * calculation. Addresses cases such as:
   * - incorrect accounting of prior usage
   * - inferior products driving a customer to refuse to be charged
   * etc.
   */
  BillingRecalculated = 'billing_recalculated',
  /**
   * A transaction to settle the usage costs for an invoice.
   * Includes a credit grant, and a pair of credit applications
   * to offset the usage costs.
   */
  SettleInvoiceUsageCosts = 'settle_invoice_usage_costs',
}

export enum SubscriptionItemType {
  Usage = 'usage',
  Static = 'static',
}

export enum DestinationEnvironment {
  Livemode = 'livemode',
  Testmode = 'testmode',
}

export enum RevenueChartIntervalUnit {
  Year = 'year',
  Month = 'month',
  Week = 'week',
  Day = 'day',
  Hour = 'hour',
}

export enum InvoiceStatus {
  Draft = 'draft',
  Open = 'open',
  Paid = 'paid',
  Uncollectible = 'uncollectible',
  Void = 'void',
  FullyRefunded = 'refunded',
  PartiallyRefunded = 'partially_refunded',
  AwaitingPaymentConfirmation = 'awaiting_payment_confirmation',
}

export enum PaymentStatus {
  // FIXME: remove "canceled"
  Canceled = 'canceled',
  Failed = 'failed',
  Refunded = 'refunded',
  Processing = 'processing',
  Succeeded = 'succeeded',
  RequiresConfirmation = 'requires_confirmation',
  RequiresAction = 'requires_action',
}

export enum CheckoutSessionStatus {
  Open = 'open',
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Expired = 'expired',
}

export enum FeeCalculationType {
  SubscriptionPayment = 'subscription_payment',
  CheckoutSessionPayment = 'checkout_session_payment',
}

export enum InvoiceType {
  Subscription = 'subscription',
  Purchase = 'purchase',
  Standalone = 'standalone',
}

export enum UsageCreditType {
  /**
   * Unlocked as a result of a subscription lifecycle event,
   * such as on creation.
   */
  Grant = 'grant',
  /**
   * Unlocked as a result of a payment, including a subscription payment.
   */
  Payment = 'payment',
}

export enum UsageCreditStatus {
  Pending = 'pending',
  Posted = 'posted',
}

export enum UsageCreditSourceReferenceType {
  InvoiceSettlement = 'invoice_settlement',
  ManualAdjustment = 'manual_adjustment',
  BillingPeriodTransition = 'billing_period_transition',
  // FIXME: Consider adding other types like Promotional, AdministrativeGrant, InitialSubscriptionGrant
}

export enum LedgerEntryStatus {
  Pending = 'pending',
  Posted = 'posted',
}

export enum LedgerEntryDirection {
  Debit = 'debit',
  Credit = 'credit',
}

export enum LedgerEntryType {
  UsageCost = 'usage_cost',
  PaymentInitiated = 'payment_initiated',
  PaymentFailed = 'payment_failed',
  CreditGrantRecognized = 'credit_grant_recognized',
  CreditBalanceAdjusted = 'credit_balance_adjusted',
  CreditGrantExpired = 'credit_grant_expired',
  PaymentRefunded = 'payment_refunded',
  BillingAdjustment = 'billing_adjustment',
  UsageCreditApplicationDebitFromCreditBalance = 'usage_credit_application_debit_from_credit_balance',
  UsageCreditApplicationCreditTowardsUsageCost = 'usage_credit_application_credit_towards_usage_cost',
}
