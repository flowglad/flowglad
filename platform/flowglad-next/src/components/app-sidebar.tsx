"use client"

import {
  Sliders as SetupIcon,
  Gauge,
  UsersThree as UsersIcon,
  Storefront as StoreIcon,
  CurrencyCircleDollar,
  Book,
  Gear as SettingsIcon,
  SidebarSimple,
  CaretDown,
  CaretRight,
  DiscordLogo,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"

import React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/utils/core"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  useSidebar,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  SidebarSeparator,
  SidebarMenu,
  SidebarMenuButton,
  SidebarRail,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Menu items.
type MenuItem = {
  title: string
  url?: string
  icon: React.ElementType
  children?: Array<{ title: string; url: string }>
}

const items: MenuItem[] = [
  {
    title: "Set Up",
    url: "/onboarding",
    icon: SetupIcon,
  },
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Gauge,
  },
  {
    title: "Customers",
    url: "/customers",
    icon: UsersIcon,
  },
  {
    title: "Store",
    icon: StoreIcon,
    children: [
      { title: "Catalogs", url: "/store/catalogs" },
      { title: "Products", url: "/store/products" },
      { title: "Discounts", url: "/store/discounts" },
      { title: "Purchases", url: "/store/purchases" },
    ],
  },
  {
    title: "Finance",
    icon: CurrencyCircleDollar,
    children: [
      { title: "Payments", url: "/finance/payments" },
      { title: "Subscriptions", url: "/finance/subscriptions" },
      { title: "Invoices", url: "/finance/invoices" },
    ],
  },
  {
    title: "Settings",
    url: "/settings",
    icon: SettingsIcon,
  },
]

function CollapsibleMenuItem({ item }: { item: MenuItem }) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton asChild onClick={() => setOpen(!open)} isActive={item.children!.some(c=>c.url===pathname)}>
          <button className="flex w-full items-center gap-3 py-3">
            <item.icon weight="fill" size={20} />
            <span className="flex-1 text-left">{item.title}</span>
            <CaretDown
              className={cn(
                "transition-transform",
                open ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {open && (
        <SidebarMenuSub>
          {item.children!.map((child) => (
            <SidebarMenuSubItem key={child.title}>
              <SidebarMenuSubButton asChild isActive={pathname === child.url}>
                <a href={child.url}>{child.title}</a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </>
  )
}

function CollapseButton() {
  const { state, toggleSidebar, isMobile } = useSidebar()
  if (isMobile) return null
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      aria-label="Toggle collapse"
      className="h-7 w-7"
    >
      <SidebarSimple
        className={state === "collapsed" ? "rotate-180 transition-transform" : "transition-transform"}
      />
    </Button>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  return (
    <>
      <Sidebar collapsible="icon">
      <SidebarHeader>
          <CollapseButton />
        </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Flowglad</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) =>
                item.children ? (
                  <CollapsibleMenuItem key={item.title} item={item} />
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <a href={item.url!} className="flex w-full items-center gap-3 py-3">
                        <item.icon weight="fill" size={20} />
                        <span className="flex-1 text-left">{item.title}</span>
                        {item.title === "Set Up" && <CaretRight size={20} />}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="https://discord.com/invite/XTK7hVyQD9" target="_blank" rel="noreferrer">
                  <DiscordLogo weight="fill" size={20} />
                  <span>Discord</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="https://docs.flowglad.com" target="_blank" rel="noreferrer">
                  <Book weight="fill" size={20} />
                  <span>Documentation</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* Rail toggle visible on desktop when collapsed */}
      <SidebarRail />
    </>
  )
}
