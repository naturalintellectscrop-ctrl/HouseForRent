'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Lock,
  Eye,
  Share2,
  Server,
  Cookie,
  Scale,
  Baby,
  RefreshCw,
  Phone,
  ArrowLeft,
  Mail,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/useAppStore';

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  content: React.ReactNode;
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function PrivacyPolicy() {
  const { setCurrentView } = useAppStore();
  const [activeSection, setActiveSection] = useState('introduction');

  const sections: Section[] = [
    {
      id: 'introduction',
      title: 'Introduction',
      icon: Shield,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            House For Rent (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting the privacy and personal information of our users. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website <span className="font-medium text-foreground">houseforrent.co.ug</span> and use our services.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            By accessing or using our platform, you agree to the terms outlined in this Privacy Policy. If you do not agree with the terms of this policy, please do not access the platform.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We comply with the data protection laws of Uganda, including the Data Protection and Privacy Act, 2019, and are committed to ensuring your personal data is handled responsibly.
          </p>
        </div>
      ),
    },
    {
      id: 'information-we-collect',
      title: 'Information We Collect',
      icon: Eye,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We collect information to provide better services to our users. The types of information we collect include:
          </p>
          <div className="space-y-3">
            {[
              {
                title: 'Personal Information',
                desc: 'Name, email address, phone number, and profile photo when you register an account. This is necessary to create and maintain your account.',
              },
              {
                title: 'Property Listing Data',
                desc: 'Property details, photos, location information, pricing, and land title information that you provide when listing a property on our platform.',
              },
              {
                title: 'Usage Data',
                desc: 'Information about how you interact with our platform, including pages visited, search queries, features used, and time spent on the platform.',
              },
              {
                title: 'Device & Technical Data',
                desc: 'IP address, browser type, operating system, device identifiers, and mobile network information for security and performance optimization.',
              },
              {
                title: 'Cookies & Tracking',
                desc: 'We use cookies and similar tracking technologies to enhance your experience, analyze usage patterns, and deliver personalized content.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'how-we-use',
      title: 'How We Use Your Information',
      icon: Lock,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We use the information we collect for the following purposes:
          </p>
          <ul className="space-y-2">
            {[
              'To provide, maintain, and improve our property listing and search services',
              'To match tenants with suitable properties and landlords with potential tenants',
              'To process payments for property listing fees (UGX 10,000 per listing)',
              'To verify user identity and prevent fraud on the platform',
              'To communicate with you about your account, listings, and inquiries',
              'To send you notifications about new properties matching your preferences',
              'To improve our platform through analytics and user feedback',
              'To comply with legal obligations and enforce our terms of service',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-muted-foreground text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      id: 'information-sharing',
      title: 'Information Sharing',
      icon: Share2,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We do not sell your personal information. We may share your information in the following circumstances:
          </p>
          <div className="space-y-3">
            {[
              {
                title: 'With Landlords/Tenants',
                desc: 'When you make an inquiry, your name and contact information are shared with the relevant landlord. Similarly, landlord contact information is shared with tenants who inquire about properties.',
              },
              {
                title: 'Service Providers',
                desc: 'We share information with trusted third-party service providers who assist us in operating the platform, processing payments (Mobile Money providers), and delivering communications.',
              },
              {
                title: 'Legal Requirements',
                desc: 'We may disclose information when required by law, such as to comply with a subpoena, court order, or Ugandan regulatory requirements.',
              },
              {
                title: 'Safety & Protection',
                desc: 'We may share information to protect the rights, property, or safety of House For Rent, our users, or the public.',
              },
            ].map((item) => (
              <div key={item.title} className="p-3 rounded-lg border border-border/60">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'data-security',
      title: 'Data Security',
      icon: Server,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We take the security of your personal information seriously and implement appropriate technical and organizational measures to protect it:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: 'Encryption', desc: 'All data transmission is encrypted using SSL/TLS protocols' },
              { title: 'Secure Servers', desc: 'Data stored on secure servers with restricted access' },
              { title: 'Access Controls', desc: 'Strict access controls limiting who can view user data' },
              { title: 'Regular Audits', desc: 'Periodic security audits and vulnerability assessments' },
            ].map((item) => (
              <div key={item.title} className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50">
                <p className="font-medium text-sm text-green-800 dark:text-green-300">{item.title}</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground italic">
            While we strive to protect your personal information, no method of electronic storage is 100% secure. We cannot guarantee absolute security.
          </p>
        </div>
      ),
    },
    {
      id: 'cookies-tracking',
      title: 'Cookies & Tracking',
      icon: Cookie,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We use cookies and similar tracking technologies to improve your experience on our platform. Here are the types we use:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-3 text-left font-semibold">Type</th>
                  <th className="py-2 px-3 text-left font-semibold">Purpose</th>
                  <th className="py-2 px-3 text-left font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium text-foreground">Essential</td>
                  <td className="py-2 px-3">Required for platform functionality, authentication, and security</td>
                  <td className="py-2 px-3">Session</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium text-foreground">Analytics</td>
                  <td className="py-2 px-3">Help us understand how users interact with the platform</td>
                  <td className="py-2 px-3">2 years</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium text-foreground">Preferences</td>
                  <td className="py-2 px-3">Remember your settings and preferences</td>
                  <td className="py-2 px-3">1 year</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">Marketing</td>
                  <td className="py-2 px-3">Deliver relevant property recommendations</td>
                  <td className="py-2 px-3">30 days</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            You can manage your cookie preferences through your browser settings. Disabling certain cookies may affect the functionality of our platform.
          </p>
        </div>
      ),
    },
    {
      id: 'your-rights',
      title: 'Your Rights',
      icon: Scale,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            Under the Data Protection and Privacy Act of Uganda, you have the following rights regarding your personal data:
          </p>
          <div className="space-y-3">
            {[
              { title: 'Right of Access', desc: 'You can request a copy of the personal data we hold about you.' },
              { title: 'Right to Correction', desc: 'You can request corrections to any inaccurate or incomplete personal data.' },
              { title: 'Right to Deletion', desc: 'You can request that we delete your personal data, subject to legal obligations.' },
              { title: 'Right to Data Portability', desc: 'You can request your data in a structured, machine-readable format.' },
              { title: 'Right to Object', desc: 'You can object to the processing of your personal data for marketing purposes.' },
              { title: 'Right to Withdraw Consent', desc: 'Where processing is based on consent, you may withdraw it at any time.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                  <CheckCircle className="h-3.5 w-3.5 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            To exercise any of these rights, please contact us at <span className="text-red-600 font-medium">gthebanks@gmail.com</span> or call <span className="text-red-600 font-medium">+256752255676</span>.
          </p>
        </div>
      ),
    },
    {
      id: 'childrens-privacy',
      title: "Children's Privacy",
      icon: Baby,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            House For Rent is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children under 18 years of age.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If we become aware that we have collected personal data from a child under 18, we will take steps to delete such information promptly. If you believe a child under 18 has provided us with personal information, please contact us immediately.
          </p>
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
            <p className="text-sm text-red-800 dark:text-red-300 font-medium">
              Parents and guardians: If you discover that your child has used our platform without your consent, please contact us at gthebanks@gmail.com so we can take appropriate action.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'changes-to-policy',
      title: 'Changes to This Policy',
      icon: RefreshCw,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. When we make changes, we will:
          </p>
          <ul className="space-y-2">
            {[
              'Update the "Last Updated" date at the top of this page',
              'Notify registered users via email for significant changes',
              'Display a prominent notice on our platform for material updates',
              'Allow a 30-day notice period before significant changes take effect',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
                <span className="text-muted-foreground text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            We encourage you to review this Privacy Policy periodically. Your continued use of the platform after any changes constitutes your acceptance of the updated policy.
          </p>
        </div>
      ),
    },
    {
      id: 'contact-us',
      title: 'Contact Us',
      icon: Phone,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <Mail className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">gthebanks@gmail.com</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">+256752255676</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-900/40">
                <Shield className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <p className="font-medium">houseforrent.co.ug</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            We aim to respond to all privacy-related inquiries within 30 business days.
          </p>
        </div>
      ),
    },
  ];

  const handleScroll = useCallback(() => {
    const sectionElements = sections.map((s) => ({
      id: s.id,
      el: document.getElementById(`section-${s.id}`),
    }));

    for (let i = sectionElements.length - 1; i >= 0; i--) {
      const el = sectionElements[i].el;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 150) {
          setActiveSection(sectionElements[i].id);
          break;
        }
      }
    }
  }, [sections]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      const offset = 100;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div>
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-red-600 via-red-700 to-red-600 py-16 sm:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.1),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(0,200,200,0.1),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10 mb-6"
            onClick={() => {
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          <motion.div {...fadeUp} className="text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <Shield className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">Privacy Policy</h1>
            <p className="mt-3 text-lg text-red-100">
              Your privacy matters to us. Learn how we protect your information.
            </p>
            <Badge className="mt-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
              Last Updated: March 4, 2026
            </Badge>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar - Desktop Only */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
                    Table of Contents
                  </h3>
                  <nav className="space-y-1">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all duration-200 flex items-center gap-2 ${
                          activeSection === section.id
                            ? 'bg-red-50 text-red-700 font-medium dark:bg-red-950/40 dark:text-red-400'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <section.icon className="h-3.5 w-3.5 shrink-0" />
                        {section.title}
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            </div>
          </aside>

          {/* Main Content */}
          <div className="min-w-0 flex-1">
            {/* Mobile Table of Contents */}
            <div className="lg:hidden mb-6">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
                    Table of Contents
                  </h3>
                  <ScrollArea className="max-h-48">
                    <nav className="space-y-1">
                      {sections.map((section) => (
                        <button
                          key={section.id}
                          onClick={() => scrollToSection(section.id)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all duration-200 flex items-center gap-2 ${
                            activeSection === section.id
                              ? 'bg-red-50 text-red-700 font-medium dark:bg-red-950/40 dark:text-red-400'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <section.icon className="h-3.5 w-3.5 shrink-0" />
                          {section.title}
                        </button>
                      ))}
                    </nav>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Sections */}
            <div className="space-y-6">
              {sections.map((section, index) => (
                <motion.div
                  key={section.id}
                  id={`section-${section.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex items-center gap-3 p-4 sm:p-6 border-b bg-muted/20">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${section.bgColor}`}>
                          <section.icon className={`h-5 w-5 ${section.color}`} />
                        </div>
                        <div>
                          <Badge variant="outline" className="text-xs text-muted-foreground mb-1">
                            Section {index + 1}
                          </Badge>
                          <h2 className="text-lg font-bold">{section.title}</h2>
                        </div>
                      </div>
                      <div className="p-4 sm:p-6">
                        {section.content}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Bottom Navigation */}
            <Separator className="my-8" />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => {
                  setCurrentView('terms');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                View Terms of Service →
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCurrentView('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
