'use client'

import { CategoryBar } from './charts/CategoryBar'

interface RevenueCategoryBarProps {
  serviceRevenue: number
  productRevenue: number
  otherRevenue: number
}

export const RevenueCategoryBar = ({
  serviceRevenue,
  productRevenue,
  otherRevenue,
}: RevenueCategoryBarProps) => {
  return (
    <div className="w-full">
      <CategoryBar
        values={[serviceRevenue, productRevenue, otherRevenue]}
        className="w-full"
        colors={['amber', 'blue', 'gray']}
      />
      <div className="flex flex-col mt-2 space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className="w-2 h-2 bg-purple-500 inline-block mr-2 rounded-lg-lg"></span>
            <span>Service</span>
          </div>
          <span>
            $
            {serviceRevenue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className="w-2 h-2 bg-blue-500 inline-block mr-2 rounded-lg-lg"></span>
            <span>Digital</span>
          </div>
          <span>
            $
            {productRevenue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className="w-2 h-2 bg-yellow-500 inline-block mr-2 rounded-lg-lg"></span>
            <span>Membership</span>
          </div>
          <span>
            $
            {otherRevenue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
