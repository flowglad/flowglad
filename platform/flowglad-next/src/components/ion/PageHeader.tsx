'use client'

import React, { useState } from 'react'
import { Tab, Tabs, TabsList } from './Tab'
import PageTitle from './PageTitle'
import Breadcrumb from '../navigation/Breadcrumb'

export interface TabData {
  label: string
  subPath: string
  Component: React.FC<{}>
  alwaysMounted?: boolean
}

interface PageHeaderProps {
  title: string
  tabs: TabData[]
  primaryButton?: React.ReactNode
  defaultSelectedTab?: string
  onTabChange?: (tab: string) => void
  hideTabs?: boolean
}

export const PageHeader = ({
  title,
  tabs,
  primaryButton,
  onTabChange,
  defaultSelectedTab,
  hideTabs = false,
}: PageHeaderProps) => {
  const [mountedTabs, setMountedTabs] = useState(
    new Set([tabs[0]?.subPath])
  )
  const [activeTab, setActiveTab] = useState(tabs[0]?.subPath)

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setMountedTabs((prev) => {
      const newSet = new Set(prev)
      newSet.add(value)
      return newSet
    })
  }

  const ActiveTabComponent = tabs.find(
    (tab) => tab.subPath === activeTab
  )?.Component!

  const [selectedTabLabel, setSelectedTabLabel] = useState(
    defaultSelectedTab || tabs[0]?.label
  )

  return (
    <>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between">
          <PageTitle>{title}</PageTitle>
          {primaryButton}
        </div>
        {!hideTabs && (
          <Tabs className="w-full flex border-b border-stroke-subtle text-sm font-semibold">
            <TabsList className="gap-8">
              {tabs.map((tab) => (
                <Tab
                  state={
                    activeTab === tab.subPath ? 'selected' : 'default'
                  }
                  className="h-full first:pl-0 last:pr-0 first:ml-0 last:mr-0 text-lg"
                  title={tab.label}
                  value={tab.subPath}
                  key={tab.subPath}
                  onClick={() => {
                    handleTabChange(tab.subPath)
                    onTabChange?.(tab.subPath)
                  }}
                />
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      <ActiveTabComponent />
    </>
  )
}
