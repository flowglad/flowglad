export type Nullish<T> = T | null | undefined

export enum StripePriceMode {
  Subscription = 'subscription',
  Payment = 'payment',
}

export interface IdNumberParam {
  id: number
}

export type WithId<T> = T & IdNumberParam

export enum ChargeType {
  Charge = 'charge',
  Refund = 'refund',
}

export enum IntervalUnit {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  Year = 'year',
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

export enum CountryCode {
  AF = 'AF', // Afghanistan
  AL = 'AL', // Albania
  DZ = 'DZ', // Algeria
  AS = 'AS', // American Samoa
  AD = 'AD', // Andorra
  AO = 'AO', // Angola
  AI = 'AI', // Anguilla
  AQ = 'AQ', // Antarctica
  AG = 'AG', // Antigua and Barbuda
  AR = 'AR', // Argentina
  AM = 'AM', // Armenia
  AW = 'AW', // Aruba
  AU = 'AU', // Australia
  AT = 'AT', // Austria
  AZ = 'AZ', // Azerbaijan
  BS = 'BS', // Bahamas
  BH = 'BH', // Bahrain
  BD = 'BD', // Bangladesh
  BB = 'BB', // Barbados
  BY = 'BY', // Belarus
  BE = 'BE', // Belgium
  BZ = 'BZ', // Belize
  BJ = 'BJ', // Benin
  BM = 'BM', // Bermuda
  BT = 'BT', // Bhutan
  BO = 'BO', // Bolivia
  BA = 'BA', // Bosnia and Herzegovina
  BW = 'BW', // Botswana
  BV = 'BV', // Bouvet Island
  BR = 'BR', // Brazil
  IO = 'IO', // British Indian Ocean Territory
  BN = 'BN', // Brunei Darussalam
  BG = 'BG', // Bulgaria
  BF = 'BF', // Burkina Faso
  BI = 'BI', // Burundi
  KH = 'KH', // Cambodia
  CM = 'CM', // Cameroon
  CA = 'CA', // Canada
  CV = 'CV', // Cape Verde
  KY = 'KY', // Cayman Islands
  CF = 'CF', // Central African Republic
  TD = 'TD', // Chad
  CL = 'CL', // Chile
  CN = 'CN', // China
  CX = 'CX', // Christmas Island
  CC = 'CC', // Cocos (Keeling) Islands
  CO = 'CO', // Colombia
  KM = 'KM', // Comoros
  CG = 'CG', // Congo
  CD = 'CD', // Congo, the Democratic Republic of the
  CK = 'CK', // Cook Islands
  CR = 'CR', // Costa Rica
  CI = 'CI', // Cote D'Ivoire
  HR = 'HR', // Croatia
  CU = 'CU', // Cuba
  CY = 'CY', // Cyprus
  CZ = 'CZ', // Czech Republic
  DK = 'DK', // Denmark
  DJ = 'DJ', // Djibouti
  DM = 'DM', // Dominica
  DO = 'DO', // Dominican Republic
  EC = 'EC', // Ecuador
  EG = 'EG', // Egypt
  SV = 'SV', // El Salvador
  GQ = 'GQ', // Equatorial Guinea
  ER = 'ER', // Eritrea
  EE = 'EE', // Estonia
  ET = 'ET', // Ethiopia
  FK = 'FK', // Falkland Islands (Malvinas)
  FO = 'FO', // Faroe Islands
  FJ = 'FJ', // Fiji
  FI = 'FI', // Finland
  FR = 'FR', // France
  GF = 'GF', // French Guiana
  PF = 'PF', // French Polynesia
  TF = 'TF', // French Southern Territories
  GA = 'GA', // Gabon
  GM = 'GM', // Gambia
  GE = 'GE', // Georgia
  DE = 'DE', // Germany
  GH = 'GH', // Ghana
  GI = 'GI', // Gibraltar
  GR = 'GR', // Greece
  GL = 'GL', // Greenland
  GD = 'GD', // Grenada
  GP = 'GP', // Guadeloupe
  GU = 'GU', // Guam
  GT = 'GT', // Guatemala
  GN = 'GN', // Guinea
  GW = 'GW', // Guinea-Bissau
  GY = 'GY', // Guyana
  HT = 'HT', // Haiti
  HM = 'HM', // Heard Island and Mcdonald Islands
  VA = 'VA', // Holy See (Vatican City State)
  HN = 'HN', // Honduras
  HK = 'HK', // Hong Kong
  HU = 'HU', // Hungary
  IS = 'IS', // Iceland
  IN = 'IN', // India
  ID = 'ID', // Indonesia
  IR = 'IR', // Iran, Islamic Republic of
  IQ = 'IQ', // Iraq
  IE = 'IE', // Ireland
  IL = 'IL', // Israel
  IT = 'IT', // Italy
  JM = 'JM', // Jamaica
  JP = 'JP', // Japan
  JO = 'JO', // Jordan
  KZ = 'KZ', // Kazakhstan
  KE = 'KE', // Kenya
  KI = 'KI', // Kiribati
  KP = 'KP', // Korea, Democratic People's Republic of
  KR = 'KR', // Korea, Republic of
  KW = 'KW', // Kuwait
  KG = 'KG', // Kyrgyzstan
  LA = 'LA', // Lao People's Democratic Republic
  LV = 'LV', // Latvia
  LB = 'LB', // Lebanon
  LS = 'LS', // Lesotho
  LR = 'LR', // Liberia
  LY = 'LY', // Libyan Arab Jamahiriya
  LI = 'LI', // Liechtenstein
  LT = 'LT', // Lithuania
  LU = 'LU', // Luxembourg
  ME = 'ME', // Montenegro
  MO = 'MO', // Macao
  MK = 'MK', // Macedonia, the Former Yugoslav Republic of
  MG = 'MG', // Madagascar
  MW = 'MW', // Malawi
  MY = 'MY', // Malaysia
  MV = 'MV', // Maldives
  ML = 'ML', // Mali
  MT = 'MT', // Malta
  MH = 'MH', // Marshall Islands
  MQ = 'MQ', // Martinique
  MR = 'MR', // Mauritania
  MU = 'MU', // Mauritius
  YT = 'YT', // Mayotte
  MX = 'MX', // Mexico
  FM = 'FM', // Micronesia, Federated States of
  MD = 'MD', // Moldova, Republic of
  MC = 'MC', // Monaco
  MN = 'MN', // Mongolia
  MS = 'MS', // Montserrat
  MA = 'MA', // Morocco
  MZ = 'MZ', // Mozambique
  MM = 'MM', // Myanmar
  NA = 'NA', // Namibia
  NR = 'NR', // Nauru
  NP = 'NP', // Nepal
  NL = 'NL', // Netherlands
  NC = 'NC', // New Caledonia
  NZ = 'NZ', // New Zealand
  NI = 'NI', // Nicaragua
  NE = 'NE', // Niger
  NG = 'NG', // Nigeria
  NU = 'NU', // Niue
  NF = 'NF', // Norfolk Island
  MP = 'MP', // Northern Mariana Islands
  NO = 'NO', // Norway
  OM = 'OM', // Oman
  PK = 'PK', // Pakistan
  PW = 'PW', // Palau
  PS = 'PS', // Palestinian Territory, Occupied
  PA = 'PA', // Panama
  PG = 'PG', // Papua New Guinea
  PY = 'PY', // Paraguay
  PE = 'PE', // Peru
  PH = 'PH', // Philippines
  PN = 'PN', // Pitcairn
  PL = 'PL', // Poland
  PT = 'PT', // Portugal
  PR = 'PR', // Puerto Rico
  QA = 'QA', // Qatar
  RE = 'RE', // Reunion
  RO = 'RO', // Romania
  RU = 'RU', // Russian Federation
  RW = 'RW', // Rwanda
  SH = 'SH', // Saint Helena
  KN = 'KN', // Saint Kitts and Nevis
  LC = 'LC', // Saint Lucia
  PM = 'PM', // Saint Pierre and Miquelon
  VC = 'VC', // Saint Vincent and the Grenadines
  WS = 'WS', // Samoa
  SM = 'SM', // San Marino
  ST = 'ST', // Sao Tome and Principe
  SA = 'SA', // Saudi Arabia
  SN = 'SN', // Senegal
  RS = 'RS', // Serbia
  SC = 'SC', // Seychelles
  SL = 'SL', // Sierra Leone
  SG = 'SG', // Singapore
  SK = 'SK', // Slovakia
  SI = 'SI', // Slovenia
  SB = 'SB', // Solomon Islands
  SO = 'SO', // Somalia
  ZA = 'ZA', // South Africa
  GS = 'GS', // South Georgia and the South Sandwich Islands
  ES = 'ES', // Spain
  LK = 'LK', // Sri Lanka
  SD = 'SD', // Sudan
  SR = 'SR', // Suriname
  SJ = 'SJ', // Svalbard and Jan Mayen
  SZ = 'SZ', // Swaziland
  SE = 'SE', // Sweden
  CH = 'CH', // Switzerland
  SY = 'SY', // Syrian Arab Republic
  TW = 'TW', // Taiwan, Province of China
  TJ = 'TJ', // Tajikistan
  TZ = 'TZ', // Tanzania, United Republic of
  TH = 'TH', // Thailand
  TL = 'TL', // Timor-Leste
  TG = 'TG', // Togo
  TK = 'TK', // Tokelau
  TO = 'TO', // Tonga
  TT = 'TT', // Trinidad and Tobago
  TN = 'TN', // Tunisia
  TR = 'TR', // Turkey
  TM = 'TM', // Turkmenistan
  TC = 'TC', // Turks and Caicos Islands
  TV = 'TV', // Tuvalu
  UG = 'UG', // Uganda
  UA = 'UA', // Ukraine
  AE = 'AE', // United Arab Emirates
  GB = 'GB', // United Kingdom
  US = 'US', // United States
  UM = 'UM', // United States Minor Outlying Islands
  UY = 'UY', // Uruguay
  UZ = 'UZ', // Uzbekistan
  VU = 'VU', // Vanuatu
  VE = 'VE', // Venezuela
  VN = 'VN', // Viet Nam
  VG = 'VG', // Virgin Islands, British
  VI = 'VI', // Virgin Islands, U.s.
  WF = 'WF', // Wallis and Futuna
  EH = 'EH', // Western Sahara
  YE = 'YE', // Yemen
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
  // Installments = 'installments',
  // PayWhatYouWant = 'pay_what_you_want',
  // ZeroPrice = 'zero_price',
}

export enum CheckoutFlowType {
  SinglePayment = 'single_payment',
  Subscription = 'subscription',
  Invoice = 'invoice',
  AddPaymentMethod = 'add_payment_method',
}

export enum SupabasePayloadType {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export interface SupabaseInsertPayload<T = object> {
  type: SupabasePayloadType.INSERT
  table: string
  schema: string
  record: T
}

export interface SupabaseUpdatePayload<T = object> {
  type: SupabasePayloadType.UPDATE
  table: string
  schema: string
  record: T
  old_record: T
}

/**
 * Basically the Stripe payment intent statuses,
 * BUT omitting:
 * - requires_capture (because we don't do pre-auths)
 * - requires_confirmation (because we don't do pre-auths)
 * - requires_payment_method (because we map this to a past payment, which implies a payment method)
 * -
 * @see https://docs.stripe.com/payments/payment-intents/verifying-status#checking-status-retrieve
 */
export enum PaymentStatus {
  // TODO: remove "canceled"
  Canceled = 'canceled',
  Failed = 'failed',
  Refunded = 'refunded',
  Processing = 'processing',
  Succeeded = 'succeeded',
  RequiresConfirmation = 'requires_confirmation',
  RequiresAction = 'requires_action',
}

export enum PaymentMethodType {
  Card = 'card',
  Link = 'link',
  USBankAccount = 'us_bank_account',
  SEPADebit = 'sepa_debit',
}

export enum SubscriptionStatus {
  Trialing = 'trialing',
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

export enum CheckoutSessionStatus {
  Open = 'open',
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
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

export enum PurchaseAccessSessionSource {
  EmailVerification = 'email_verification',
  CheckoutSession = 'checkout_session',
}

export enum FlowRunStatus {
  Completed = 'completed',
  Failed = 'failed',
}

export enum FlowgladEventType {
  // SchedulerEventCreated = 'scheduler.event.created',
  CustomerCreated = 'customer.created',
  CustomerUpdated = 'customer.updated',
  PurchaseCompleted = 'purchase.completed',
  PaymentFailed = 'payment.failed',
  PaymentSucceeded = 'payment.succeeded',
  SubscriptionCreated = 'subscription.created',
  SubscriptionUpdated = 'subscription.updated',
  SubscriptionCancelled = 'subscription.canceled',
}

export enum EventCategory {
  Financial = 'financial',
  Customer = 'customer',
  Subscription = 'subscription',
  System = 'system',
}

export enum EventRetentionPolicy {
  Permanent = 'permanent', // 7+ years
  Medium = 'medium', // 2-3 years
  Short = 'short', // 6-12 months
}

export enum EventNoun {
  Customer = 'customer',
  User = 'user',
  Purchase = 'purchase',
  Invoice = 'invoice',
  Payment = 'payment',
  Product = 'product',
  Subscription = 'subscription',
}

/**
 * experimental
 *
 * Used as metadata in procedures
 */
export type ProcedureInfo = {
  path: string
  description: string
  examples?: string[]
}

export enum CommunityPlatform {
  Discord = 'discord',
  Slack = 'slack',
}

export enum CommunityMembershipStatus {
  Active = 'active',
  Expired = 'expired',
  Cancelled = 'canceled',
  Banned = 'banned',
  Pending = 'pending',
  Unclaimed = 'unclaimed',
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

export type FileUploadData = {
  objectKey: string
  publicURL: string
}

export enum Nouns {
  Product = 'product',
  Price = 'price',
  Customer = 'customer',
  Discount = 'discount',
  File = 'file',
}

export enum Verbs {
  Create = 'create',
  Edit = 'edit',
}

export enum OnboardingItemType {
  Stripe = 'stripe',
  Product = 'product',
  Discount = 'discount',
  CopyKeys = 'copy_keys',
  InstallPackages = 'install_packages',
}

export interface OnboardingChecklistItem {
  title: string
  description: string
  completed: boolean
  action?: string
  type?: OnboardingItemType
}

export enum OfferingType {
  File = 'file',
  Link = 'link',
}

export type ApiEnvironment = 'test' | 'live'

export enum FlowgladApiKeyType {
  Publishable = 'publishable',
  Secret = 'secret',
  BillingPortalToken = 'hosted_billing_portal',
}

export enum StripeConnectContractType {
  Platform = 'platform',
  MerchantOfRecord = 'merchant_of_record',
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

export enum FeeCalculationType {
  SubscriptionPayment = 'subscription_payment',
  CheckoutSessionPayment = 'checkout_session_payment',
}

export enum InvoiceType {
  Subscription = 'subscription',
  Purchase = 'purchase',
  Standalone = 'standalone',
}

export enum SubscriptionCancellationArrangement {
  Immediately = 'immediately',
  AtEndOfCurrentBillingPeriod = 'at_end_of_current_billing_period',
  AtFutureDate = 'at_future_date',
}

export enum SubscriptionCancellationRefundPolicy {
  ProrateRefund = 'prorate_refund',
  FullRefund = 'full_refund',
  NoRefund = 'no_refund',
  // ProrateAccountCredit = 'prorate_account_credit',
}

export enum SubscriptionAdjustmentTiming {
  Immediately = 'immediately',
  AtEndOfCurrentBillingPeriod = 'at_end_of_current_billing_period',
  // AtFutureDate = 'at_future_date',
}

export enum CheckoutSessionType {
  Product = 'product',
  Purchase = 'purchase',
  AddPaymentMethod = 'add_payment_method',
  Invoice = 'invoice',
}

export type SetupIntentableCheckoutSessionType = Exclude<
  CheckoutSessionType,
  CheckoutSessionType.Invoice
>

export enum FeatureFlag {
  Usage = 'usage',
}

export enum UsageMeterAggregationType {
  Sum = 'sum',
  CountDistinctProperties = 'count_distinct_properties',
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
  // TODO: Consider adding other types like Promotional, AdministrativeGrant, InitialSubscriptionGrant
}

export enum RefundStatus {
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export enum LedgerEntryStatus {
  Pending = 'pending',
  Posted = 'posted',
}

export enum LedgerEntryDirection {
  Debit = 'debit',
  Credit = 'credit',
}

export enum LedgerEntryEntryType {
  UsageCost = 'usage_cost',
  PaymentSucceeded = 'payment_succeeded',
  PaymentInitiated = 'payment_initiated',
  PaymentFailed = 'payment_failed',
  CreditGrantRecognized = 'credit_grant_recognized',
  CreditAppliedToUsage = 'credit_applied_to_usage',
  CreditBalanceAdjusted = 'credit_balance_adjusted',
  CreditGrantExpired = 'credit_grant_expired',
  BillingAdjustment = 'billing_adjustment',
  PaymentRefunded = 'payment_refunded',
}

export enum LedgerTransactionInitiatingSourceType {
  UsageEvent = 'usage_event',
  Payment = 'payment',
  ManualAdjustment = 'manual_adjustment',
}

export enum FeatureType {
  Toggle = 'toggle',
  UsageCreditGrant = 'usage_credit_grant',
}

export enum FeatureUsageGrantFrequency {
  Once = 'once',
  EveryBillingPeriod = 'every_billing_period',
}

export enum PlanInterval {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export enum NormalBalanceType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}
