import React from 'react';

/**
 * Booking.com Official-style Vector SVGs and Illustrations.
 * Strictly 0 emojis. All icons have clean geometric paths and scalable props.
 */

// ============================================================================
// CORE NAVIGATION & SEARCH ICONS
// ============================================================================

export function SearchIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

export function BedIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M2.75 12h18.5c.69 0 1.25.56 1.25 1.25V18l.75-.75H.75l.75.75v-4.75c0-.69.56-1.25 1.25-1.25m0-1.5A2.75 2.75 0 0 0 0 13.25V18c0 .414.336.75.75.75h22.5A.75.75 0 0 0 24 18v-4.75a2.75 2.75 0 0 0-2.75-2.75zM0 18v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 0 18m22.5 0v3a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-1.5 0m-.75-6.75V4.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 2.25 4.5v6.75a.75.75 0 0 0 1.5 0V4.5a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 0 1.5 0m-13.25-3h7a.25.25 0 0 1 .25.25v2.75l.75-.75h-9l.75.75V8.5a.25.25 0 0 1 .25-.25m0-1.5A1.75 1.75 0 0 0 6.75 8.5v2.75c0 .414.336.75.75.75h9a.75.75 0 0 0 .75-.75V8.5a1.75 1.75 0 0 0-1.75-1.75z" />
    </svg>
  );
}

export function CalendarIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M22.5 13.5v8.25a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1-.75-.75V5.25a.75.75 0 0 1 .75-.75h19.5a.75.75 0 0 1 .75.75zm1.5 0V5.25A2.25 2.25 0 0 0 21.75 3H2.25A2.25 2.25 0 0 0 0 5.25v16.5A2.25 2.25 0 0 0 2.25 24h19.5A2.25 2.25 0 0 0 24 21.75zm-23.25-3h22.5a.75.75 0 0 0 0-1.5H.75a.75.75 0 0 0 0 1.5M7.5 6V.75a.75.75 0 0 0-1.5 0V6a.75.75 0 0 0 1.5 0M18 6V.75a.75.75 0 0 0-1.5 0V6A.75.75 0 0 0 18 6M5.095 14.03a.75.75 0 1 0 1.06-1.06.75.75 0 0 0-1.06 1.06m.53-1.28a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25.75.75 0 0 0 0 1.5.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75.75.75 0 0 0 0-1.5m-.53 6.53a.75.75 0 1 0 1.06-1.06.75.75 0 0 0-1.06 1.06m.53-1.28a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25.75.75 0 0 0 0 1.5.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75.75.75 0 0 0 0-1.5m5.845-3.97a.75.75 0 1 0 1.06-1.06.75.75 0 0 0-1.06 1.06m.53-1.28A1.125 1.125 0 1 0 12 15a1.125 1.125 0 0 0 0-2.25.75.75 0 0 0 0 1.5.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75.75.75 0 0 0 0-1.5m-.53 6.53a.75.75 0 1 0 1.06-1.06.75.75 0 0 0-1.06 1.06M12 18a1.125 1.125 0 1 0 0 2.25A1.125 1.125 0 0 0 12 18a.75.75 0 0 0 0 1.5.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75.75.75 0 0 0 0-1.5m5.845-3.97a.75.75 0 1 0 1.06-1.06.75.75 0 0 0-1.06 1.06m.53-1.28a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25.75.75 0 0 0 0 1.5.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75.75.75 0 0 0 0-1.5m-.53 6.53a.75.75 0 1 0 1.06-1.06.75.75 0 0 0-1.06 1.06m.53-1.28a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25.75.75 0 0 0 0 1.5.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75.75.75 0 0 0 0-1.5" />
    </svg>
  );
}

export function UserIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M16.5 6a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0M18 6A6 6 0 1 0 6 6a6 6 0 0 0 12 0M3 23.25a9 9 0 1 1 18 0 .75.75 0 0 0 1.5 0c0-5.799-4.701-10.5-10.5-10.5S1.5 17.451 1.5 23.25a.75.75 0 0 0 1.5 0" />
    </svg>
  );
}

export function UsersIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function ChildIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="7" r="3.5" />
      <path d="M12 11v6" />
      <path d="M9 13l3-2 3 2" />
      <path d="M9 21l3-4 3 4" />
    </svg>
  );
}

export function PinIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M12 0a8.01 8.01 0 0 0-8 8c0 3.51 5 12.025 7.148 15.524A1 1 0 0 0 12 24a.99.99 0 0 0 .852-.477C15 20.026 20 11.514 20 8a8.01 8.01 0 0 0-8-8m0 11.5A3.5 3.5 0 1 1 15.5 8a3.5 3.5 0 0 1-3.5 3.5" />
    </svg>
  );
}

export function CloseIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CheckmarkIcon({ size = 16, color = '#008009', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function HeartIcon({ size = 20, filled = false, color = '#e11d48', outlineColor = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={filled ? color : outlineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function ShareIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export function StarIcon({ size = 16, color = '#f59e0b', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function StarFilledIcon({ size = 16, color = '#f59e0b', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M19.268 8.913a.9.9 0 0 1-.266.642l-6.057 6.057A1.3 1.3 0 0 1 12 16c-.35.008-.69-.123-.945-.364L4.998 9.58a.91.91 0 0 1 0-1.284.897.897 0 0 1 1.284 0L12 13.99l5.718-5.718a.897.897 0 0 1 1.284 0 .88.88 0 0 1 .266.642" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function FilterIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export function SortIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="3" y1="6" x2="15" y2="6" />
      <line x1="3" y1="12" x2="11" y2="12" />
      <line x1="3" y1="18" x2="7" y2="18" />
      <polyline points="17 9 20 6 23 9" />
      <line x1="20" y1="6" x2="20" y2="18" />
    </svg>
  );
}

export function MapIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

// ============================================================================
// AMENITY ICONS
// ============================================================================

export function WifiIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="2.5" />
    </svg>
  );
}

export function PoolIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2 13h20" />
      <path d="M2 17c2 1 4 1 6 0s4-1 6 0 4 1 6 0" />
      <path d="M2 21c2 1 4 1 6 0s4-1 6 0 4 1 6 0" />
      <circle cx="16" cy="5" r="2.2" />
      <path d="M12 9l2 2 4-2" />
    </svg>
  );
}

export function ParkingIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </svg>
  );
}

export function CoffeeIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

export function PetsIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <circle cx="4.5" cy="9.5" r="2" />
      <circle cx="9" cy="5.5" r="2" />
      <circle cx="15" cy="5.5" r="2" />
      <circle cx="19.5" cy="9.5" r="2" />
      <path d="M12 11c-3 0-5.5 2-5.5 5 0 2 1.5 4 5.5 4s5.5-2 5.5-4c0-3-2.5-5-5-5z" />
    </svg>
  );
}

export function NoSmokingIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="2" y1="2" x2="22" y2="22" stroke="#d4111e" strokeWidth="2.5" />
      <path d="M18 8h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6" />
      <path d="M7 14H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h7" />
    </svg>
  );
}

export function FamilyIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function ShowerIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 4h7a4 4 0 0 1 4 4v1" />
      <path d="M11 9h8l1 3H10l1-3z" />
      <path d="M12 16v1" />
      <path d="M15 16v2" />
      <path d="M18 16v1" />
    </svg>
  );
}

export function KitchenIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M18 2v20" />
      <path d="M21 2v4a3 3 0 0 1-3 3" />
      <path d="M6 2v7a3 3 0 0 0 3 3v8" />
      <path d="M3 2v5a3 3 0 0 0 3 3" />
      <path d="M9 2v5a3 3 0 0 1-3 3" />
    </svg>
  );
}

export function ApartmentIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="6" x2="9.01" y2="6" strokeWidth="2.5" />
      <line x1="15" y1="6" x2="15.01" y2="6" strokeWidth="2.5" />
      <line x1="9" y1="10" x2="9.01" y2="10" strokeWidth="2.5" />
      <line x1="15" y1="10" x2="15.01" y2="10" strokeWidth="2.5" />
      <line x1="9" y1="14" x2="9.01" y2="14" strokeWidth="2.5" />
      <line x1="15" y1="14" x2="15.01" y2="14" strokeWidth="2.5" />
      <path d="M9 18h6v4H9z" />
    </svg>
  );
}

export function ClockIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function InfoIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2.5" />
    </svg>
  );
}

export function CreditCardIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

export function GymIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 5v14" />
      <path d="M18 5v14" />
      <path d="M3 8v8" />
      <path d="M21 8v8" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}

export function TvIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
      <polyline points="17 2 12 7 7 2" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

export function LandmarkIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="2" y1="22" x2="22" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 2 7 22 7 12 2" />
    </svg>
  );
}

export function TrainIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="3" width="16" height="16" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <path d="m8 19-3 3" />
      <path d="m16 19 3 3" />
    </svg>
  );
}

// ============================================================================
// BRAND & TRUST ICONS (REPLACING EMOJIS)
// ============================================================================

export function HotelBuildingIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <path d="M9 7h1" />
      <path d="M14 7h1" />
      <path d="M9 11h1" />
      <path d="M14 11h1" />
      <path d="M9 15h1" />
      <path d="M14 15h1" />
      <path d="M10 21v-3h4v3" />
    </svg>
  );
}

export function DocumentIcon({ size = 24, color = '#003580', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

export function ThumbsUpIcon({ size = 24, color = '#003580', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function GlobeIcon({ size = 24, color = '#003580', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function HeadsetIcon({ size = 24, color = '#003580', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

export function LoadingSpinnerIcon({ size = 32, color = '#003580', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function PriceMatchIcon({ size = 16, color = '#008009', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

// ============================================================================
// COUNTRY FLAGS (SVG VECTORS - NO EMOJIS)
// ============================================================================

export function EcuadorFlagIcon({ size = 18, className = '' }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 36 24" className={className} aria-label="Ecuador flag">
      <rect width="36" height="12" fill="#ffdd00" />
      <rect y="12" width="36" height="6" fill="#0033a0" />
      <rect y="18" width="36" height="6" fill="#da291c" />
      <ellipse cx="18" cy="12" rx="2.5" ry="3" fill="#0033a0" opacity="0.8" />
    </svg>
  );
}

export function SpainFlagIcon({ size = 18, className = '' }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 36 24" className={className} aria-label="Spain flag">
      <rect width="36" height="6" fill="#aa151b" />
      <rect y="6" width="36" height="12" fill="#f1bf00" />
      <rect y="18" width="36" height="6" fill="#aa151b" />
      <rect x="8" y="9" width="3" height="6" fill="#aa151b" rx="1" />
    </svg>
  );
}

// ============================================================================
// OFFICIAL-STYLE BOOKING.COM BADGES & ILLUSTRATIONS
// ============================================================================

export function TravelProudIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#rainbowGradient)" />
      <defs>
        <linearGradient id="rainbowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e11d48" />
          <stop offset="25%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="75%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PreferredPlusBadge({ size = 16, className = '' }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#003580',
        color: '#ffb700',
        borderRadius: '3px',
        padding: '2px 4px',
        fontSize: '0.68rem',
        fontWeight: 800,
        gap: '2px',
        letterSpacing: '0.2px',
      }}
      title="Booking.com Preferred Plus Partner"
    >
      <ThumbsUpIcon size={12} color="#ffb700" />
      <span>+</span>
    </span>
  );
}

export function GeniusGiftIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="24" width="48" height="34" rx="4" fill="#003580" />
      <rect x="4" y="16" width="56" height="10" rx="3" fill="#006ce4" />
      <rect x="28" y="16" width="8" height="42" fill="#ffb700" />
      <path d="M32 16c-4-8-12-8-14-3s2 11 14 11c12 0 16-6 14-11s-10-5-14 3z" stroke="#ffb700" strokeWidth="4" fill="none" />
      <circle cx="16" cy="12" r="2" fill="#ffb700" />
      <circle cx="48" cy="12" r="2.5" fill="#006ce4" />
      <circle cx="56" cy="28" r="1.5" fill="#ffb700" />
    </svg>
  );
}

export function SurveyAvatarIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#e0f2fe" />
      <circle cx="32" cy="24" r="12" fill="#0284c7" />
      <path d="M12 54c0-11 9-20 20-20s20 9 20 20" fill="#0284c7" />
      <circle cx="46" cy="18" r="8" fill="#f59e0b" />
      <text x="43" y="23" fill="#ffffff" fontSize="13" fontWeight="bold">?</text>
    </svg>
  );
}

export function MapPinCardIllustration({ width = '100%', height = 80, className = '' }) {
  return (
    <svg width={width} height={height} viewBox="0 0 240 80" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mapBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="50%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#ede9fe" />
        </linearGradient>
      </defs>
      <rect width="240" height="80" fill="url(#mapBgGrad)" />
      {/* Map Roads / Contours */}
      <path d="M-10 25 Q 60 40 120 20 T 250 50" stroke="#cbd5e1" strokeWidth="5" fill="none" />
      <path d="M40 -10 Q 70 50 160 90" stroke="#ffffff" strokeWidth="6" fill="none" />
      <path d="M120 -10 L 150 90" stroke="#93c5fd" strokeWidth="3" fill="none" opacity="0.7" />
      <path d="M-10 65 Q 80 50 180 75 T 250 15" stroke="#ffffff" strokeWidth="4" fill="none" />
      {/* Subtle landmarks */}
      <circle cx="65" cy="35" r="5" fill="#38bdf8" opacity="0.6" />
      <circle cx="180" cy="55" r="6" fill="#818cf8" opacity="0.5" />
    </svg>
  );
}

export function NoResultsIllustration({ size = 120, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
      <circle cx="60" cy="60" r="54" fill="#f0f7ff" stroke="#bfdbfe" strokeWidth="2" strokeDasharray="4 4" />
      <rect x="34" y="44" width="52" height="42" rx="6" fill="#003580" />
      <rect x="42" y="34" width="36" height="12" rx="4" fill="none" stroke="#006ce4" strokeWidth="3" />
      <line x1="34" y1="58" x2="86" y2="58" stroke="#006ce4" strokeWidth="2" />
      <circle cx="60" cy="72" r="4" fill="#ffb700" />
      <circle cx="82" cy="38" r="14" fill="#ffffff" stroke="#006ce4" strokeWidth="3" />
      <line x1="92" y1="48" x2="102" y2="58" stroke="#006ce4" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function BookingGeniusBadge({ width = 60, height = 24, className = '' }) {
  return (
    <span role="img" aria-label="Logo Genius" className={className} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <svg width={width} height={height} viewBox="0 0 80 32" fill="none">
        <rect width="80" height="32" rx="4" fill="#004cb8" />
        <path
          fill="#ffffff"
          d="m44.97 5.55c.22 0 .34.09.37.27l.01.08v6c0 .6.15 1.08.47 1.45.31.36.75.55 1.32.55.84 0 1.52-.35 2.06-1.04l.12-.17V5.9c0-.2.09-.32.27-.35l.08-.01h2.2c.2 0 .32.09.34.27l.01.08v9.97c0 .2-.09.32-.27.34l-.08.01h-1.79c-.21 0-.37-.08-.46-.23l-.04-.08-.26-.64c-.29.26-.54.47-.75.61-.21.15-.51.28-.89.41-.39.12-.81.19-1.28.19-1.22 0-2.19-.38-2.9-1.13-.66-.7-1.01-1.64-1.06-2.82l-.01-.28V5.9c0-.2.09-.32.28-.35l.09-.01zm12.8-.35c1.77 0 3.12.56 4.03 1.69.14.17.14.32 0 .47l-.07.06-1.18 1.1c-.17.13-.35.11-.52-.07-.62-.66-1.36-.99-2.2-.99-.52 0-.94.08-1.25.23-.31.15-.47.36-.47.62 0 .31.2.56.6.76.4.2 1.06.38 1.97.54 2.5.42 3.75 1.53 3.75 3.31 0 1.08-.42 1.93-1.26 2.56-.84.63-1.87.94-3.1.94-1.27 0-2.31-.27-3.13-.8-.82-.53-1.4-1.21-1.73-2.03-.09-.19-.05-.34.12-.44l.08-.04 1.66-.74c.22-.1.37-.04.46.17.18.45.48.83.92 1.12s.96.44 1.57.44c.51 0 .92-.1 1.23-.28.31-.19.47-.45.47-.77 0-.37-.2-.66-.61-.88-.41-.22-1.12-.42-2.14-.61-1.03-.19-1.85-.56-2.45-1.11-.6-.55-.91-1.23-.91-2.05 0-.98.38-1.76 1.13-2.33.75-.58 1.76-.87 3.03-.87zm-36.68 0c1.64 0 2.93.51 3.86 1.52.93 1.01 1.39 2.29 1.39 3.82v.7c0 .23-.12.35-.35.35h-7.5c.16.67.48 1.21.95 1.62.47.41 1.07.61 1.8.61.99 0 1.74-.41 2.27-1.23.09-.13.23-.15.41-.07l1.87.79c.22.07.27.2.15.39-1.06 1.8-2.63 2.7-4.71 2.7-1.57 0-2.9-.53-4-1.58-1.1-1.05-1.65-2.4-1.65-4.03s.55-2.98 1.64-4.03c1.09-1.05 2.38-1.58 3.86-1.58zm-12.38-5.2c2.16 0 4.14.74 5.66 1.96.07.06.12.14.13.23.01.09-.02.18-.08.26-.39.47-1.2 1.44-1.6 1.92-.06.07-.15.12-.24.13-.09.01-.18-.02-.25-.08-.96-.81-2.23-1.31-3.62-1.31-2.98 0-5.39 2.38-5.39 5.15s2.41 5.04 5.39 5.04c1.16 0 2.23-.34 3.1-.92v-2.25h-2.55c-.09 0-.18-.03-.25-.1-.06-.07-.1-.15-.1-.25v-2.18c0-.09.04-.18.1-.25.07-.06.16-.1.25-.1h5.03c.19 0 .35.16.35.35v6.31c0 .21-.09.4-.25.54-1.52 1.22-3.51 1.96-5.67 1.96-4.81 0-8.71-3.65-8.71-8.14 0-4.49 3.9-8.26 8.71-8.26zm24.55 5.2c1.22 0 2.16.33 2.82 1 .61.62.94 1.47.99 2.56l.01.26v6.79c0 .2-.09.32-.27.34l-.08.01h-2.2c-.2 0-.32-.09-.34-.27l-.01-.08v-6.03c0-1.32-.6-1.97-1.81-1.97-.41 0-.81.12-1.22.37-.34.21-.61.43-.82.67l-.12.14v6.82c0 .2-.09.32-.28.34l-.09.01h-2.18c-.22 0-.34-.09-.36-.27l-.01-.08v-9.97c0-.2.09-.32.28-.35l.09-.01h1.79c.21 0 .36.08.44.24l.04.09.28.61c.93-.82 1.95-1.23 3.05-1.23zm7.52.27c.22 0 .34.09.36.27l.01.08v9.97c0 .2-.09.32-.28.34l-.09.01h-2.18c-.22 0-.34-.09-.36-.27l-.01-.08v-9.97c0-.2.09-.32.28-.35l.09-.01zm-19.7 2.21c-.64 0-1.17.16-1.6.49s-.74.76-.93 1.28h5.01c-.1-.5-.38-.92-.85-1.26-.47-.34-1.01-.51-1.64-.51z"
          transform="translate(9 7)"
        />
        <circle cx="47" cy="9.5" r="1.5" fill="#febb02" />
      </svg>
    </span>
  );
}

export function FlightIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M21.41 13.09l-8.49-3.4V3.75a1.5 1.5 0 0 0-3 0v3.15L3.6 4.4a.75.75 0 0 0-.96.96l2.5 6.32-3.39 1.36v2.21l4.5-1.12 1.5 2.6v1.5l2.25-.56 1.88 2.22 1.5-.37-.75-3.38 8.42-3.37a.75.75 0 0 0 .36-.88z" />
    </svg>
  );
}

export function CarRentalIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16m11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5M5 11l1.5-4.5h11L19 11z"/>
    </svg>
  );
}

export function AttractionsNavIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21M5.64 5.64l4.6 4.6M13.76 13.76l4.6 4.6M5.64 18.36l4.6-4.6M13.76 10.24l4.6-4.6" />
    </svg>
  );
}

export function AirportTaxiIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M18.92 7.01C18.72 6.42 18.16 6 17.5 6h-1.5V4.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0-.75.75V6H6.5c-.66 0-1.21.42-1.42 1.01L3 13v7c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-7zM9.5 5.25h5v.75h-5zM6.5 16.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5M5.2 12l1.35-4.5h10.9L18.8 12z"/>
    </svg>
  );
}

export function RoundFlag({ country = 'EC', size = 24, className = '' }) {
  const code = (country || 'EC').toUpperCase();
  if (code === 'GB' || code === 'UK' || code === 'EN') {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.4)', flexShrink: 0, background: '#012169' }}>
        <svg viewBox="0 0 60 30" width={size * 1.5} height={size * 1.5} style={{ objectFit: 'cover' }}>
          <clipPath id="flag_s">
            <path d="M0,0 v30 h60 v-30 z"/>
          </clipPath>
          <clipPath id="flag_t">
            <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/>
          </clipPath>
          <g clipPath="url(#flag_s)">
            <path d="M0,0 v30 h60 v-30 z" fill="#012169"/>
            <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
            <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag_t)" stroke="#C8102E" strokeWidth="4"/>
            <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
            <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/>
          </g>
        </svg>
      </div>
    );
  }
  if (code === 'ES') {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.4)', flexShrink: 0 }}>
        <svg viewBox="0 0 750 500" width={size * 1.5} height={size * 1.5} style={{ objectFit: 'cover' }}>
          <rect width="750" height="500" fill="#c60b1e" />
          <rect y="125" width="750" height="250" fill="#ffc400" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.4)', flexShrink: 0 }}>
      <svg viewBox="0 0 36 24" width={size * 1.5} height={size * 1.5} style={{ objectFit: 'cover' }}>
        <rect width="36" height="12" fill="#FFD100" />
        <rect y="12" width="36" height="6" fill="#0033A0" />
        <rect y="18" width="36" height="6" fill="#DA291C" />
        <ellipse cx="18" cy="12" rx="3.5" ry="3" fill="#007A3D" />
        <circle cx="18" cy="12" r="1.5" fill="#FFD100" />
      </svg>
    </div>
  );
}

export function LockIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  );
}


export function AirportShuttleIcon({ size = 14, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 3c-.1.3-.1.6-.1.9v4c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
    </svg>
  );
}

export function MoreVerticalIcon({ size = 20, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="1.5" fill={color}/>
      <circle cx="12" cy="5" r="1.5" fill={color}/>
      <circle cx="12" cy="19" r="1.5" fill={color}/>
    </svg>
  );
}

export function CheckCircleIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function PlaneIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z" />
    </svg>
  );
}

export function CarIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

export function TicketIcon({ size = 16, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </svg>
  );
}




