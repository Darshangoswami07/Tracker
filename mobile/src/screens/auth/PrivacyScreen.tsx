import { LegalScreen } from '../../components/LegalScreen';

const SECTIONS = [
  {
    heading: '1. Information We Collect',
    paragraphs: [
      'We collect information you provide directly, such as your name, email address, phone number, company details and payment information, as well as data generated through your use of the platform, including order history and delivery locations.',
    ],
  },
  {
    heading: '2. How We Use Your Information',
    paragraphs: [
      'We use your information to operate and improve the platform, process orders and payments, provide customer support, send important service updates, and comply with legal obligations.',
      'We do not sell your personal information to third parties.',
    ],
  },
  {
    heading: '3. Location Data',
    paragraphs: [
      'Location data is collected to power live delivery tracking and route optimisation for drivers. It is stored securely and only accessible to parties directly involved in fulfilling your order.',
    ],
  },
  {
    heading: '4. Data Security',
    paragraphs: [
      'We implement industry-standard technical and organisational measures to protect your data, including encryption in transit and at rest, and strict access controls.',
      'While we strive to protect your personal information, no method of transmission over the internet is completely secure.',
    ],
  },
  {
    heading: '5. Data Sharing',
    paragraphs: [
      'We may share your information with service providers who help us operate the platform (such as payment processors and cloud hosting providers), and with legal authorities when required by law.',
    ],
  },
  {
    heading: '6. Your Rights',
    paragraphs: [
      'You may access, correct, update or request deletion of your personal information at any time by contacting our support team. You may also opt out of marketing communications.',
    ],
  },
  {
    heading: '7. Contact Us',
    paragraphs: [
      'If you have questions about this Privacy Policy or our data practices, contact us at jobpilotdesk@gmail.com or call +91 7456849590.',
    ],
  },
];

/** Privacy policy page reachable from the Welcome screen. */
export const PrivacyScreen = () => {
  return (
    <LegalScreen title="Privacy Policy" updatedAt="August 7, 2026" sections={SECTIONS} />
  );
};

export default PrivacyScreen;
