#!/usr/bin/env tsx

/**
 * Script to populate the countries table with all ISO 3166-1 alpha-2 country codes and names.
 * This script should be run after setting up a fresh database to ensure the countries table
 * is populated with all necessary country data for the application.
 *
 * Usage:
 *   pnpm tsx src/scripts/seed-countries.ts
 *   or
 *   pnpm seed:countries
 */

import { loadEnvConfig } from '@next/env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { countries } from '@/db/schema/countries'
import { CountryCode } from '@/types'
import core from '@/utils/core'
import { logger } from '@/utils/logger'

// Load environment variables
const projectDir = process.cwd()
loadEnvConfig(projectDir)

// Country data mapping ISO 3166-1 alpha-2 codes to country names
const COUNTRY_DATA: Record<CountryCode, string> = {
  [CountryCode.AD]: 'Andorra',
  [CountryCode.AE]: 'United Arab Emirates',
  [CountryCode.AF]: 'Afghanistan',
  [CountryCode.AG]: 'Antigua and Barbuda',
  [CountryCode.AI]: 'Anguilla',
  [CountryCode.AL]: 'Albania',
  [CountryCode.AM]: 'Armenia',
  [CountryCode.AO]: 'Angola',
  [CountryCode.AQ]: 'Antarctica',
  [CountryCode.AR]: 'Argentina',
  [CountryCode.AS]: 'American Samoa',
  [CountryCode.AT]: 'Austria',
  [CountryCode.AU]: 'Australia',
  [CountryCode.AW]: 'Aruba',
  [CountryCode.AX]: 'Åland Islands',
  [CountryCode.AZ]: 'Azerbaijan',
  [CountryCode.BA]: 'Bosnia and Herzegovina',
  [CountryCode.BB]: 'Barbados',
  [CountryCode.BD]: 'Bangladesh',
  [CountryCode.BE]: 'Belgium',
  [CountryCode.BF]: 'Burkina Faso',
  [CountryCode.BG]: 'Bulgaria',
  [CountryCode.BH]: 'Bahrain',
  [CountryCode.BI]: 'Burundi',
  [CountryCode.BJ]: 'Benin',
  [CountryCode.BL]: 'Saint Barthélemy',
  [CountryCode.BM]: 'Bermuda',
  [CountryCode.BN]: 'Brunei Darussalam',
  [CountryCode.BO]: 'Bolivia',
  [CountryCode.BQ]: 'Bonaire, Sint Eustatius and Saba',
  [CountryCode.BR]: 'Brazil',
  [CountryCode.BS]: 'Bahamas',
  [CountryCode.BT]: 'Bhutan',
  [CountryCode.BV]: 'Bouvet Island',
  [CountryCode.BW]: 'Botswana',
  [CountryCode.BY]: 'Belarus',
  [CountryCode.BZ]: 'Belize',
  [CountryCode.CA]: 'Canada',
  [CountryCode.CC]: 'Cocos (Keeling) Islands',
  [CountryCode.CD]: 'Congo, the Democratic Republic of the',
  [CountryCode.CF]: 'Central African Republic',
  [CountryCode.CG]: 'Congo',
  [CountryCode.CH]: 'Switzerland',
  [CountryCode.CI]: "Cote D'Ivoire",
  [CountryCode.CK]: 'Cook Islands',
  [CountryCode.CL]: 'Chile',
  [CountryCode.CM]: 'Cameroon',
  [CountryCode.CN]: 'China',
  [CountryCode.CO]: 'Colombia',
  [CountryCode.CR]: 'Costa Rica',
  [CountryCode.CU]: 'Cuba',
  [CountryCode.CV]: 'Cape Verde',
  [CountryCode.CW]: 'Curaçao',
  [CountryCode.CX]: 'Christmas Island',
  [CountryCode.CY]: 'Cyprus',
  [CountryCode.CZ]: 'Czech Republic',
  [CountryCode.DE]: 'Germany',
  [CountryCode.DJ]: 'Djibouti',
  [CountryCode.DK]: 'Denmark',
  [CountryCode.DM]: 'Dominica',
  [CountryCode.DO]: 'Dominican Republic',
  [CountryCode.DZ]: 'Algeria',
  [CountryCode.EC]: 'Ecuador',
  [CountryCode.EE]: 'Estonia',
  [CountryCode.EG]: 'Egypt',
  [CountryCode.EH]: 'Western Sahara',
  [CountryCode.ER]: 'Eritrea',
  [CountryCode.ES]: 'Spain',
  [CountryCode.ET]: 'Ethiopia',
  [CountryCode.FI]: 'Finland',
  [CountryCode.FJ]: 'Fiji',
  [CountryCode.FK]: 'Falkland Islands (Malvinas)',
  [CountryCode.FM]: 'Micronesia, Federated States of',
  [CountryCode.FO]: 'Faroe Islands',
  [CountryCode.FR]: 'France',
  [CountryCode.GA]: 'Gabon',
  [CountryCode.GB]: 'United Kingdom',
  [CountryCode.GD]: 'Grenada',
  [CountryCode.GE]: 'Georgia',
  [CountryCode.GF]: 'French Guiana',
  [CountryCode.GG]: 'Guernsey',
  [CountryCode.GH]: 'Ghana',
  [CountryCode.GI]: 'Gibraltar',
  [CountryCode.GL]: 'Greenland',
  [CountryCode.GM]: 'Gambia',
  [CountryCode.GN]: 'Guinea',
  [CountryCode.GP]: 'Guadeloupe',
  [CountryCode.GQ]: 'Equatorial Guinea',
  [CountryCode.GR]: 'Greece',
  [CountryCode.GS]: 'South Georgia and the South Sandwich Islands',
  [CountryCode.GT]: 'Guatemala',
  [CountryCode.GU]: 'Guam',
  [CountryCode.GW]: 'Guinea-Bissau',
  [CountryCode.GY]: 'Guyana',
  [CountryCode.HK]: 'Hong Kong',
  [CountryCode.HM]: 'Heard Island and Mcdonald Islands',
  [CountryCode.HN]: 'Honduras',
  [CountryCode.HR]: 'Croatia',
  [CountryCode.HT]: 'Haiti',
  [CountryCode.HU]: 'Hungary',
  [CountryCode.ID]: 'Indonesia',
  [CountryCode.IE]: 'Ireland',
  [CountryCode.IL]: 'Israel',
  [CountryCode.IM]: 'Isle of Man',
  [CountryCode.IN]: 'India',
  [CountryCode.IO]: 'British Indian Ocean Territory',
  [CountryCode.IQ]: 'Iraq',
  [CountryCode.IR]: 'Iran, Islamic Republic of',
  [CountryCode.IS]: 'Iceland',
  [CountryCode.IT]: 'Italy',
  [CountryCode.JE]: 'Jersey',
  [CountryCode.JM]: 'Jamaica',
  [CountryCode.JO]: 'Jordan',
  [CountryCode.JP]: 'Japan',
  [CountryCode.KE]: 'Kenya',
  [CountryCode.KG]: 'Kyrgyzstan',
  [CountryCode.KH]: 'Cambodia',
  [CountryCode.KI]: 'Kiribati',
  [CountryCode.KM]: 'Comoros',
  [CountryCode.KN]: 'Saint Kitts and Nevis',
  [CountryCode.KP]: "Korea, Democratic People's Republic of",
  [CountryCode.KR]: 'Korea, Republic of',
  [CountryCode.KW]: 'Kuwait',
  [CountryCode.KY]: 'Cayman Islands',
  [CountryCode.KZ]: 'Kazakhstan',
  [CountryCode.LA]: "Lao People's Democratic Republic",
  [CountryCode.LB]: 'Lebanon',
  [CountryCode.LC]: 'Saint Lucia',
  [CountryCode.LI]: 'Liechtenstein',
  [CountryCode.LK]: 'Sri Lanka',
  [CountryCode.LR]: 'Liberia',
  [CountryCode.LS]: 'Lesotho',
  [CountryCode.LT]: 'Lithuania',
  [CountryCode.LU]: 'Luxembourg',
  [CountryCode.LV]: 'Latvia',
  [CountryCode.LY]: 'Libyan Arab Jamahiriya',
  [CountryCode.MA]: 'Morocco',
  [CountryCode.MC]: 'Monaco',
  [CountryCode.MD]: 'Moldova, Republic of',
  [CountryCode.ME]: 'Montenegro',
  [CountryCode.MF]: 'Saint Martin (French part)',
  [CountryCode.MG]: 'Madagascar',
  [CountryCode.MH]: 'Marshall Islands',
  [CountryCode.MK]: 'Macedonia, the Former Yugoslav Republic of',
  [CountryCode.ML]: 'Mali',
  [CountryCode.MM]: 'Myanmar',
  [CountryCode.MN]: 'Mongolia',
  [CountryCode.MO]: 'Macao',
  [CountryCode.MP]: 'Northern Mariana Islands',
  [CountryCode.MQ]: 'Martinique',
  [CountryCode.MR]: 'Mauritania',
  [CountryCode.MS]: 'Montserrat',
  [CountryCode.MT]: 'Malta',
  [CountryCode.MU]: 'Mauritius',
  [CountryCode.MV]: 'Maldives',
  [CountryCode.MW]: 'Malawi',
  [CountryCode.MX]: 'Mexico',
  [CountryCode.MY]: 'Malaysia',
  [CountryCode.MZ]: 'Mozambique',
  [CountryCode.NA]: 'Namibia',
  [CountryCode.NC]: 'New Caledonia',
  [CountryCode.NE]: 'Niger',
  [CountryCode.NF]: 'Norfolk Island',
  [CountryCode.NG]: 'Nigeria',
  [CountryCode.NI]: 'Nicaragua',
  [CountryCode.NL]: 'Netherlands',
  [CountryCode.NO]: 'Norway',
  [CountryCode.NP]: 'Nepal',
  [CountryCode.NR]: 'Nauru',
  [CountryCode.NU]: 'Niue',
  [CountryCode.NZ]: 'New Zealand',
  [CountryCode.OM]: 'Oman',
  [CountryCode.PA]: 'Panama',
  [CountryCode.PE]: 'Peru',
  [CountryCode.PF]: 'French Polynesia',
  [CountryCode.PG]: 'Papua New Guinea',
  [CountryCode.PH]: 'Philippines',
  [CountryCode.PK]: 'Pakistan',
  [CountryCode.PL]: 'Poland',
  [CountryCode.PM]: 'Saint Pierre and Miquelon',
  [CountryCode.PN]: 'Pitcairn',
  [CountryCode.PR]: 'Puerto Rico',
  [CountryCode.PS]: 'Palestinian Territory, Occupied',
  [CountryCode.PT]: 'Portugal',
  [CountryCode.PW]: 'Palau',
  [CountryCode.PY]: 'Paraguay',
  [CountryCode.QA]: 'Qatar',
  [CountryCode.RE]: 'Reunion',
  [CountryCode.RO]: 'Romania',
  [CountryCode.RS]: 'Serbia',
  [CountryCode.RU]: 'Russian Federation',
  [CountryCode.RW]: 'Rwanda',
  [CountryCode.SA]: 'Saudi Arabia',
  [CountryCode.SB]: 'Solomon Islands',
  [CountryCode.SC]: 'Seychelles',
  [CountryCode.SD]: 'Sudan',
  [CountryCode.SE]: 'Sweden',
  [CountryCode.SG]: 'Singapore',
  [CountryCode.SH]: 'Saint Helena',
  [CountryCode.SI]: 'Slovenia',
  [CountryCode.SJ]: 'Svalbard and Jan Mayen',
  [CountryCode.SK]: 'Slovakia',
  [CountryCode.SL]: 'Sierra Leone',
  [CountryCode.SM]: 'San Marino',
  [CountryCode.SN]: 'Senegal',
  [CountryCode.SO]: 'Somalia',
  [CountryCode.SR]: 'Suriname',
  [CountryCode.SS]: 'South Sudan',
  [CountryCode.ST]: 'Sao Tome and Principe',
  [CountryCode.SV]: 'El Salvador',
  [CountryCode.SX]: 'Sint Maarten (Dutch part)',
  [CountryCode.SY]: 'Syrian Arab Republic',
  [CountryCode.SZ]: 'Swaziland',
  [CountryCode.TC]: 'Turks and Caicos Islands',
  [CountryCode.TD]: 'Chad',
  [CountryCode.TF]: 'French Southern Territories',
  [CountryCode.TG]: 'Togo',
  [CountryCode.TH]: 'Thailand',
  [CountryCode.TJ]: 'Tajikistan',
  [CountryCode.TK]: 'Tokelau',
  [CountryCode.TL]: 'Timor-Leste',
  [CountryCode.TM]: 'Turkmenistan',
  [CountryCode.TN]: 'Tunisia',
  [CountryCode.TO]: 'Tonga',
  [CountryCode.TR]: 'Turkey',
  [CountryCode.TT]: 'Trinidad and Tobago',
  [CountryCode.TV]: 'Tuvalu',
  [CountryCode.TW]: 'Taiwan, Province of China',
  [CountryCode.TZ]: 'Tanzania, United Republic of',
  [CountryCode.UA]: 'Ukraine',
  [CountryCode.UG]: 'Uganda',
  [CountryCode.UM]: 'United States Minor Outlying Islands',
  [CountryCode.US]: 'United States',
  [CountryCode.UY]: 'Uruguay',
  [CountryCode.UZ]: 'Uzbekistan',
  [CountryCode.VA]: 'Holy See (Vatican City State)',
  [CountryCode.VC]: 'Saint Vincent and the Grenadines',
  [CountryCode.VE]: 'Venezuela',
  [CountryCode.VG]: 'Virgin Islands, British',
  [CountryCode.VI]: 'Virgin Islands, U.s.',
  [CountryCode.VN]: 'Viet Nam',
  [CountryCode.VU]: 'Vanuatu',
  [CountryCode.WF]: 'Wallis and Futuna',
  [CountryCode.WS]: 'Samoa',
  [CountryCode.XK]: 'Kosovo',
  [CountryCode.YE]: 'Yemen',
  [CountryCode.YT]: 'Mayotte',
  [CountryCode.ZA]: 'South Africa',
  [CountryCode.ZM]: 'Zambia',
  [CountryCode.ZW]: 'Zimbabwe',
}

async function seedCountries() {
  logger.info('🌍 Starting countries table seeding...')

  if (!process.env.VERCEL_GIT_COMMIT_SHA) {
    process.env.VERCEL_GIT_COMMIT_SHA = '__DEV__'
  }

  const dbUrl = core.envVariable('DATABASE_URL')
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const client = postgres(dbUrl, {
    max: 1,
    idle_timeout: 5,
    prepare: false,
  })

  const db = drizzle(client, { logger: false })

  try {
    const existingCountries = await db
      .select()
      .from(countries)
      .limit(1)

    if (existingCountries.length > 0) {
      logger.info(
        '⚠️  Countries table already contains data. Skipping seeding.'
      )
      logger.info(
        `   Found ${existingCountries.length} existing country record(s).`
      )
      return
    }

    const countryRecords = Object.entries(COUNTRY_DATA).map(
      ([code, name]) => ({
        code: code as CountryCode,
        name,
      })
    )

    logger.info(`📝 Inserting ${countryRecords.length} countries...`)

    const batchSize = 50
    let insertedCount = 0

    for (let i = 0; i < countryRecords.length; i += batchSize) {
      const batch = countryRecords.slice(i, i + batchSize)
      await db.insert(countries).values(batch)
      insertedCount += batch.length
      logger.info(
        `   ✅ Inserted ${insertedCount}/${countryRecords.length} countries`
      )
    }

    // Verify the insertion
    const totalCountries = await db.select().from(countries)
    logger.info(`🎉 Successfully seeded countries table!`)
    logger.info(
      `   Total countries in database: ${totalCountries.length}`
    )

    // Show some examples
    const sampleCountries = totalCountries.slice(0, 5)
    logger.info('   Sample countries:')
    sampleCountries.forEach((country) => {
      logger.info(`     - ${country.name} (${country.code})`)
    })
  } catch (error) {
    logger.error('❌ Error seeding countries table:', { error })
    throw error
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  seedCountries()
    .then(() => {
      logger.info('✅ Countries seeding completed successfully!')
      process.exit(0)
    })
    .catch((error) => {
      logger.error('❌ Countries seeding failed:', { error })
      process.exit(1)
    })
}

export { seedCountries }
