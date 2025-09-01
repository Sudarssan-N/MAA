import React from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Header: React.FC = () => {
  const { t } = useTranslation();
  return (
    <header className="bg-[#CD1309] text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="text-2xl font-bold tracking-tight">{t('welcome')}</div>
        <div className="flex items-center space-x-6">
          <a href="#" className="text-sm hover:underline">{t('login')}</a>
          <a href="#" className="text-sm hover:underline">{t('recommendations')}</a>
          <a href="#" className="text-sm hover:underline">{t('chat')}</a>
          <a href="#" className="text-sm hover:underline">{t('spanish')}</a>
          <div className="relative">
            <input
              type="text"
              placeholder={t('search') || 'Search'}
              className="pl-3 pr-10 py-1 rounded text-black text-sm"
            />
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;