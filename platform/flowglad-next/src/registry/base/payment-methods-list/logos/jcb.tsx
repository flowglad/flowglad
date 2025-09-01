import React from 'react'

export const JCBLogo = ({
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
      <rect width="49" height="49" rx="8" fill="white" />
      <rect
        x="6"
        y="12"
        width="12"
        height="25"
        rx="2"
        fill="#0E4C96"
      />
      <rect
        x="19"
        y="12"
        width="12"
        height="25"
        rx="2"
        fill="#DC3545"
      />
      <rect
        x="32"
        y="12"
        width="12"
        height="25"
        rx="2"
        fill="#00A650"
      />
      <text
        x="12"
        y="28"
        fill="white"
        fontSize="8"
        fontWeight="bold"
        textAnchor="middle"
      >
        J
      </text>
      <text
        x="25"
        y="28"
        fill="white"
        fontSize="8"
        fontWeight="bold"
        textAnchor="middle"
      >
        C
      </text>
      <text
        x="38"
        y="28"
        fill="white"
        fontSize="8"
        fontWeight="bold"
        textAnchor="middle"
      >
        B
      </text>
    </svg>
  )
}
