import { LegalScreen } from '../../components/LegalScreen';

const SECTIONS = [
  {
    heading: '1. Acceptance of Terms',
    paragraphs: [
      'By accessing or using DeliveryHub, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any part of these terms, you must not use the platform.',
      'DeliveryHub provides a logistics and delivery management platform connecting businesses, drivers and customers for the scheduling, tracking and fulfilment of deliveries.',
    ],
  },
  {
    heading: '2. Accounts & Eligibility',
    paragraphs: [
      'You must be at least 18 years old and provide accurate, current and complete information when creating an account. You are responsible for safeguarding your credentials and for all activity under your account.',
      'Business accounts require verification before activation. We reserve the right to suspend or terminate accounts that violate these terms or applicable law.',
    ],
  },
  {
    heading: '3. Platform Use',
    paragraphs: [
      'The platform is provided on an "as is" and "as available" basis. We may modify, suspend or discontinue any feature at any time without prior notice.',
      'You agree not to misuse the platform, attempt to interfere with its operation, or use it for any unlawful purpose.',
    ],
  },
  {
    heading: '4. Orders & Payments',
    paragraphs: [
      'Orders are accepted when confirmed through the platform. Delivery times are estimates and may vary based on traffic, weather and other conditions beyond our control.',
      'All fees and payments are processed securely. Applicable taxes are shown at the time of checkout unless stated otherwise.',
    ],
  },
  {
    heading: '5. Limitation of Liability',
    paragraphs: [
      'To the maximum extent permitted by law, DeliveryHub shall not be liable for any indirect, incidental, special, consequential or punitive damages arising from your use of the platform.',
      'Our aggregate liability shall not exceed the amounts paid by you to DeliveryHub in the three (3) months preceding the claim.',
    ],
  },
  {
    heading: '6. Termination',
    paragraphs: [
      'We may terminate or suspend access to the platform immediately, without prior notice or liability, for any reason, including a breach of these Terms.',
      'Upon termination, your right to use the platform ceases immediately.',
    ],
  },
];

/** Legal terms page reachable from the Welcome screen. */
export const TermsScreen = () => {
  return (
    <LegalScreen title="Terms of Service" updatedAt="August 7, 2026" sections={SECTIONS} />
  );
};

export default TermsScreen;
