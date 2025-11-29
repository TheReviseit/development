'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authService } from '@/lib/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'CRM', href: '/crm' },
  { name: 'Automation', href: '/automation' },
  { name: 'Broadcasts', href: '/broadcasts' },
  { name: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    authService.logout();
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold">ReviseIt</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                block px-4 py-2.5 rounded-lg font-medium transition-colors
                ${isActive 
                  ? 'bg-black text-white' 
                  : 'text-gray-700 hover:bg-gray-100'
                }
              `}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg font-medium text-left transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
