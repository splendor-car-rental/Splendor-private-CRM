import React from 'react';

/**
 * Every phone number in this app is stored as "+<countryCode> <national digits>"
 * (see PhoneNumberInput / formatPhoneNumber). Rendered as plain text inside the
 * app's RTL document (document.documentElement.dir flips to 'rtl' for Arabic --
 * see LanguageContext), the browser's bidi algorithm can visually reorder the
 * "+"/country-code group to the end of the string instead of the start. <bdi>
 * with dir="ltr" isolates the number from the surrounding RTL paragraph so it
 * always renders left-to-right, regardless of what's around it.
 */
export const PhoneText: React.FC<{ value?: string | null; className?: string }> = ({ value, className }) => {
  if (!value) return null;
  return <bdi dir="ltr" className={className}>{value}</bdi>;
};
