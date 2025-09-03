import React from 'react'

export const UnionPayLogo = ({
  className = 'h-8 w-auto',
}: {
  className?: string
}) => {
  return (
    <svg
      className={className}
      viewBox="0 0 49 49"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="49" height="49" rx="8" fill="#005BAC" />
      <rect x="12" y="16" width="10" height="17" fill="#DC3545" />
      <rect x="19" y="16" width="10" height="17" fill="#FFF" />
      <rect x="26" y="16" width="10" height="17" fill="#005BAC" />
      <text
        x="24"
        y="26"
        fill="#005BAC"
        fontSize="6"
        fontWeight="bold"
        textAnchor="middle"
      >
        UnionPay
      </text>
    </svg>
  )
}
