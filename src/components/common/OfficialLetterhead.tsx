import React from 'react';
import { OfficialLetterheadLayout } from './OfficialLetterheadLayout';

export { OfficialLetterheadLayout };

export const OfficialLetterheadHeader: React.FC = () => {
  return (
    <div className="w-full">
      {/* Handled centrally in OfficialLetterheadLayout */}
    </div>
  );
};

export const OfficialLetterheadFooter: React.FC = () => {
  return (
    <div className="w-full">
      {/* Handled centrally in OfficialLetterheadLayout */}
    </div>
  );
};

export const OfficialLetterhead: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className
}) => {
  return (
    <OfficialLetterheadLayout className={className}>
      {children}
    </OfficialLetterheadLayout>
  );
};
