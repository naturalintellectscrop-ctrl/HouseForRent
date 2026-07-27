'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  User,
  Building2,
  CreditCard,
  Ban,
  ShieldCheck,
  Scale,
  XCircle,
  RefreshCw,
  Phone,
  ArrowLeft,
  Mail,
  CheckCircle,
  AlertTriangle,
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

export default function TermsOfService() {
  const { setCurrentView } = useAppStore();
  const [activeSection, setActiveSection] = useState('acceptance');

  const sections: Section[] = [
    {
      id: 'acceptance',
      title: 'Acceptance of Terms',
      icon: FileText,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            By accessing or using the House For Rent platform at <span className="font-medium text-foreground">houseforrent.co.ug</span>, you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the platform.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            These Terms constitute a legally binding agreement between you and House For Rent. They govern your use of the platform, including all features, functionalities, and services offered.
          </p>
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">
                <span className="font-medium">Important:</span> By using our platform, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you are using the platform on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'user-accounts',
      title: 'User Accounts',
      icon: User,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            To use certain features of our platform, you must register for an account. When creating an account, you agree to:
          </p>
          <ul className="space-y-2">
            {[
              'Provide accurate, current, and complete registration information',
              'Maintain and promptly update your account information',
              'Keep your password secure and not share it with anyone',
              'Accept responsibility for all activities under your account',
              'Notify us immediately of any unauthorized use of your account',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
                <span className="text-muted-foreground text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <h4 className="font-semibold text-sm mb-3">Account Types</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  title: 'Tenant',
                  desc: 'Browse, search, and inquire about properties. Save favorites and communicate directly with landlords.',
                  color: 'border-cyan-200 bg-cyan-50 dark:bg-cyan-950/30 dark:border-cyan-900/50',
                },
                {
                  title: 'Landlord',
                  desc: 'List properties, manage inquiries, track views, and receive direct tenant communications.',
                  color: 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50',
                },
                {
                  title: 'Admin',
                  desc: 'Manage the platform, verify listings, review user accounts, and maintain platform quality.',
                  color: 'border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900/50',
                },
              ].map((type) => (
                <div key={type.title} className={`p-3 rounded-lg border ${type.color}`}>
                  <p className="font-medium text-sm">{type.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{type.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'property-listings',
      title: 'Property Listings',
      icon: Building2,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            Landlords may list properties on the platform subject to the following requirements:
          </p>
          <div className="space-y-3">
            {[
              {
                title: 'Accuracy',
                desc: 'All listing details including property description, location, pricing, and features must be accurate and truthful.',
              },
              {
                title: 'Photos',
                desc: 'Photos must be current and accurately represent the property. Using photos of other properties is strictly prohibited.',
              },
              {
                title: 'Pricing',
                desc: 'All prices must be displayed in Ugandan Shillings (UGX) and must include all mandatory fees. Hidden charges are not allowed.',
              },
              {
                title: 'Listing Fee',
                desc: 'A non-refundable listing fee of UGX 10,000 is required for each property listing. Payment must be verified before the listing goes live.',
              },
              {
                title: 'Land Titles',
                desc: 'Landlords must specify the type of land title (Ready Title, Agreement, Mailo Land, Crown Land) for each property. Misrepresentation of title type is a violation.',
              },
              {
                title: 'Approval Process',
                desc: 'All listings are subject to review and approval by our team. We reserve the right to reject or remove any listing that violates our guidelines.',
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
      id: 'payments',
      title: 'Payments',
      icon: CreditCard,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            The following payment terms apply to our platform:
          </p>
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Listing Fees</h4>
              <p className="text-sm text-muted-foreground">
                Each property listing requires a non-refundable fee of <span className="font-medium text-foreground">UGX 10,000</span>. This fee covers the cost of listing review, platform maintenance, and property visibility.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Payment Methods</h4>
              <p className="text-sm text-muted-foreground mb-2">We accept the following payment methods:</p>
              <div className="flex flex-wrap gap-2">
                {['MTN Mobile Money', 'Airtel Money', 'Bank Transfer'].map((method) => (
                  <Badge key={method} variant="outline" className="text-xs">
                    {method}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Payment Verification</h4>
              <p className="text-sm text-muted-foreground">
                All payments are verified before listings are published. You will receive a payment reference number upon successful payment. Listings remain in &quot;pending&quot; status until payment is confirmed.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'prohibited-activities',
      title: 'Prohibited Activities',
      icon: Ban,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            The following activities are strictly prohibited on the House For Rent platform:
          </p>
          <div className="space-y-2">
            {[
              { title: 'Fraud', desc: 'Creating fake listings, impersonating other users, or providing false information' },
              { title: 'Fake Listings', desc: 'Listing properties that do not exist, are not available, or do not belong to you' },
              { title: 'Harassment', desc: 'Harassing, threatening, or intimidating other users through messages or inquiries' },
              { title: 'Spam', desc: 'Sending unsolicited messages, advertisements, or promotional content to other users' },
              { title: 'Illegal Activities', desc: 'Using the platform for any illegal purposes under Ugandan law' },
              { title: 'Price Manipulation', desc: 'Listing properties at misleading prices or engaging in bait-and-switch tactics' },
              { title: 'Data Scraping', desc: 'Automated collection of data from the platform without explicit permission' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
            <p className="text-sm text-red-800 dark:text-red-300 font-medium">
              Violations may result in immediate account suspension, listing removal, and permanent ban from the platform.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'property-verification',
      title: 'Property Verification',
      icon: ShieldCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            House For Rent employs a verification process to enhance trust and safety on our platform:
          </p>
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Physical Verification</h4>
              <p className="text-sm text-muted-foreground">
                Our team may conduct physical visits to verify property existence, condition, and accuracy of listing details. Verified properties receive a &quot;Verified&quot; badge on the platform.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Safety Warnings</h4>
              <p className="text-sm text-muted-foreground">
                We encourage all users to visit properties in person before making any payments. Never send money before viewing a property. Report suspicious listings immediately.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium">Always verify before you commit</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    We verify what we can, but users should independently confirm property details before entering into any agreements.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'liability',
      title: 'Liability',
      icon: Scale,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            House For Rent operates as an intermediary platform connecting tenants and landlords. Please note:
          </p>
          <div className="space-y-3">
            {[
              {
                title: 'Platform as Intermediary',
                desc: 'We facilitate connections between tenants and landlords but are not a party to any rental or sale agreements between users.',
              },
              {
                title: 'No Guarantee of Property Quality',
                desc: 'We do not guarantee the condition, quality, or suitability of any property listed on the platform. Users are responsible for independently verifying property details.',
              },
              {
                title: 'User Responsibility',
                desc: 'Users are solely responsible for their interactions with other users. We recommend conducting due diligence before entering into any agreements.',
              },
              {
                title: 'Limitation of Liability',
                desc: 'House For Rent shall not be liable for any direct, indirect, incidental, or consequential damages arising from the use of the platform or interactions between users.',
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
      id: 'dispute-resolution',
      title: 'Dispute Resolution',
      icon: Scale,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            In the event of a dispute arising from the use of our platform:
          </p>
          <div className="space-y-3">
            {[
              {
                step: '1',
                title: 'Contact Process',
                desc: 'First, contact the other party directly through our platform to attempt resolution. If unresolved, contact our support team at gthebanks@gmail.com.',
              },
              {
                step: '2',
                title: 'Mediation',
                desc: 'We may offer mediation services to help resolve disputes between users. Mediation is voluntary and non-binding.',
              },
              {
                step: '3',
                title: 'Legal Jurisdiction',
                desc: 'These Terms are governed by and construed in accordance with the laws of the Republic of Uganda. Any legal proceedings shall be brought in the courts of Uganda.',
              },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 font-bold text-sm">
                  {item.step}
                </div>
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
      id: 'termination',
      title: 'Termination',
      icon: XCircle,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We reserve the right to terminate or suspend accounts under the following conditions:
          </p>
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Account Suspension</h4>
              <p className="text-sm text-muted-foreground">
                Accounts may be suspended for violations of these Terms, fraudulent activity, or conduct harmful to other users or the platform. We will provide notice of suspension via email where possible.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Listing Removal</h4>
              <p className="text-sm text-muted-foreground">
                We may remove any listing that violates our guidelines, receives multiple complaints, or is found to contain false information without prior notice.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-border/60">
              <h4 className="font-semibold text-sm mb-2">Refund Policy</h4>
              <p className="text-sm text-muted-foreground">
                Listing fees are non-refundable. If a listing is removed due to a platform error, we may offer a credit for a future listing. No cash refunds are provided for listing fees.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'changes-to-terms',
      title: 'Changes to Terms',
      icon: RefreshCw,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            We may update these Terms of Service from time to time. When we make changes, we will:
          </p>
          <ul className="space-y-2">
            {[
              'Update the "Effective Date" at the top of this page',
              'Notify registered users via email for significant changes',
              'Display a prominent notice on our platform for material updates',
              'Provide a 30-day notice period before significant changes take effect',
              'Allow users to review changes before they become binding',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-muted-foreground text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Your continued use of the platform after any changes constitutes acceptance of the updated Terms. If you do not agree with the changes, you must stop using the platform.
          </p>
        </div>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      icon: Phone,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/40',
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about these Terms of Service, please contact us:
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
                <FileText className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <p className="font-medium">houseforrent.co.ug</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            For legal inquiries, please include &quot;Legal Inquiry&quot; in the subject line of your email.
          </p>
        </div>
      ),
    },
  ];

  const handleScroll = useCallback(() => {
    const sectionElements = sections.map((s) => ({
      id: s.id,
      el: document.getElementById(`tos-section-${s.id}`),
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
    const el = document.getElementById(`tos-section-${id}`);
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(255,255,255,0.1),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(0,200,200,0.1),transparent_50%)]" />
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
                <FileText className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">Terms of Service</h1>
            <p className="mt-3 text-lg text-red-100">
              Please read these terms carefully before using our platform.
            </p>
            <Badge className="mt-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
              Effective Date: March 4, 2026
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
                  id={`tos-section-${section.id}`}
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
                  setCurrentView('privacy');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                ← View Privacy Policy
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
