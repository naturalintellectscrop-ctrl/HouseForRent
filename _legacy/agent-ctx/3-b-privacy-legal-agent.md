# Task 3-b: Privacy Policy and Terms of Service

## Work Completed

### Files Modified
1. `/src/store/useAppStore.ts` - Added 'privacy' and 'terms' to ViewMode type
2. `/src/components/house-for-rent/AppShell.tsx` - Added import and case statements for privacy/terms
3. `/src/components/house-for-rent/Footer.tsx` - Added navigation links for Privacy Policy and Terms of Service
4. `/src/components/house-for-rent/ContactPage.tsx` - Added privacy FAQ question with link

### Files Created
1. `/src/components/house-for-rent/PrivacyPolicy.tsx` - Complete privacy policy page
2. `/src/components/house-for-rent/TermsOfService.tsx` - Complete terms of service page

### Key Design Decisions
- Both legal pages use identical layout pattern: hero banner → sidebar TOC (desktop) / collapsible TOC (mobile) → Card sections with icon badges
- Scroll-tracking via scroll event listener for active section highlighting in sidebar
- Cross-navigation between Privacy Policy and Terms of Service pages
- RED/CYAN/GREEN brand colors throughout (no blue/indigo)
- All section IDs use unique prefixes (`section-` for privacy, `tos-section-` for terms) to avoid ID conflicts
- UGX 10,000 listing fee and Mobile Money payment methods referenced in Terms
- Ugandan Data Protection and Privacy Act (2019) referenced in Privacy Policy
- Ugandan law jurisdiction for dispute resolution in Terms

### Lint Status
- Clean, no errors
- Dev server compiling successfully
