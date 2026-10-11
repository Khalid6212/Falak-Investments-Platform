import type {
  SubmissionStatus,
  FundingStage,
  CustomerModel,
  RevenueModel,
  Currency,
  VehicleType,
  InvestorType,
  CompanyValuationType,
  InvestorCapitalTransactionType,
  Department,
} from "@/generated/prisma/client";

export interface Dictionary {
  common: {
    appName: string;
  };
  nav: {
    portfolioDashboard: string;
    companyList: string;
    managePortfolio: string;
    investorDashboard: string;
    vehicleDashboard: string;
    companyReports: string;
    startupForm: string;
    reviewWorkspace: string;
    access: string;
    openMenu: string;
    back: string;
    closeMenu: string;
    signOut: string;
  };
  language: {
    ariaSwitchToArabic: string;
    ariaSwitchToEnglish: string;
    buttonLabelAr: string;
    buttonLabelEn: string;
  };
  theme: {
    ariaSwitchToDark: string;
    ariaSwitchToLight: string;
  };
  status: Record<SubmissionStatus, { label: string; description: string }>;
  stages: Record<FundingStage, string>;
  customerModels: Record<CustomerModel, string>;
  revenueModels: Record<RevenueModel, string>;
  currencyNames: Record<Currency, string>;
  vehicleTypes: Record<VehicleType, string>;
  investorTypes: Record<InvestorType, string>;
  departments: Record<Department, string>;
  staffRoleNames: Record<"FALAK_ADMIN" | "FALAK_MANAGEMENT" | "FALAK_OPERATIONS", string>;
  valuationTypes: Record<CompanyValuationType, string>;
  capitalTransactionTypes: Record<InvestorCapitalTransactionType, string>;
  admin: {
    title: string;
    subtitle: string;
    dashboardPeriodLabel: string;
    companyListTitle: string;
    exportCompaniesLabel: string;
    exportPortfolioLabel: string;
    companyListSubtitle: string;
    kpi: {
      companiesLabel: string;
      vehiclesLabel: string;
      investorsLabel: string;
      completionLabel: string;
      completionHint: string;
      overdueLabel: string;
      revenueSectionLabel: string;
      noCrossCurrencyNote: string;
      excludesPrefix: string;
      excludesSuffixSingular: string;
      summaryLabel: string;
    };
    reportingStatusPanel: {
      title: string;
      lastUpdatedColumn: string;
      deadlineColumn: string;
      neverSubmitted: string;
      daysOverdueSuffix: string;
      withinDeadline: string;
    };
    alerts: {
      title: string;
      noAlerts: string;
      severityHigh: string;
      severityMedium: string;
      reportingOverduePrefix: string;
      lowRunwaySingular: string;
      lowRunwayPlural: string;
      overduePayables: string;
      overdueReceivables: string;
    };
    filters: {
      title: string;
      scopeNote: string;
      searchLabel: string;
      searchPlaceholder: string;
      clearSearchAriaLabel: string;
      vehicleLabel: string;
      periodLabel: string;
      currencyLabel: string;
      statusLabel: string;
      investmentYearLabel: string;
      allOption: string;
      resetFilters: string;
      viewTable: string;
      viewCards: string;
    };
    table: {
      caption: string;
      companyColumn: string;
      sectorColumn: string;
      customerModelColumn: string;
      entryStageColumn: string;
      currentStageColumn: string;
      vehicleColumn: string;
      revenueColumn: string;
      statusColumn: string;
      lastUpdatedColumn: string;
      viewCompanyAction: string;
      noDataValue: string;
      departmentColumn: string;
      investmentYearColumn: string;
      grossMarginColumn: string;
      cashBurnColumn: string;
      noVehicleValue: string;
    };
    emptyState: string;
    charts: {
      moreSeriesLabel: string;
      otherSliceLabel: string;
      valuationAxisLabel: string;
      burnLabel: string;
      percentileLabel: string;
      navPanelTitle: string;
      companyTrendsCaption: string;
      revenueGrowthQoqColumn: string;
      burnChangeQoqColumn: string;
      runwayColumn: string;
      noTrendDataMessage: string;
      investedCapitalLabel: string;
      portfolioMoicLabel: string;
      moicNotAvailableLabel: string;
      noDataMessage: string;
      currencyToggleLabel: string;
      totalLabel: string;
      byVehicleLabel: string;
      byDepartmentLabel: string;
      allOption: string;
      startupCountChartTitle: string;
      investedCapitalChartTitle: string;
      navChartTitle: string;
      marketCapChartTitle: string;
      marketCapByStartupChartTitle: string;
      vintageVsInvestmentChartTitle: string;
      reportingStatusChartTitle: string;
      fundsFormedLabel: string;
      startupsInvestedLabel: string;
      submissionViewLabel: string;
      auditedViewLabel: string;
      submittedLabel: string;
      notSubmittedLabel: string;
      auditedLabel: string;
      notAuditedLabel: string;
      fundListTitle: string;
      fundNameColumn: string;
      navColumn: string;
      numberOfInvestorsColumn: string;
      sectorDistributionChartTitle: string;
      vehicleDistributionChartTitle: string;
      stageDistributionChartTitle: string;
      investmentYearChartTitle: string;
    };
    manage: {
      sectionTitle: string;
      indexSubtitle: string;
      invitesSectionTitle: string;
      vehicleAssignmentTitle: string;
      investorVehicleAssignmentTitle: string;
      investorVehicleAssignmentsCaption: string;
      effectiveFromLabel: string;
      commitmentAmountLabel: string;
      ownershipPctAutoHint: string;
      unassignAction: string;
      recordCompanyValuationTitle: string;
      recordVehicleValuationTitle: string;
      recordCapitalTransactionTitle: string;
      amountLabel: string;
      transactionDateLabel: string;
      descriptionLabel: string;
      valuationAmountLabel: string;
      navAmountLabel: string;
      valuationTypeLabel: string;
      asOfDateLabel: string;
      sourceLabel: string;
      nameEnLabel: string;
      nameArLabel: string;
      slugLabel: string;
      sectorEnLabel: string;
      sectorArLabel: string;
      customerModelLabel: string;
      revenueModelsLabel: string;
      currencyLabel: string;
      entryStageLabel: string;
      currentStageLabel: string;
      departmentLabel: string;
      vintageYearLabel: string;
      setDepartmentTitle: string;
      setVintageYearTitle: string;
      typeLabel: string;
      submitLabel: string;
      archiveAction: string;
      companyLabel: string;
      companiesLabel: string;
      vehicleLabel: string;
      investedAmountLabel: string;
      ownershipPctLabel: string;
      ownershipPctOptionalLabel: string;
      vehicleDescriptionEnLabel: string;
      vehicleDescriptionArLabel: string;
      investorEmailLabel: string;
      investorPhoneLabel: string;
      investorBriefEnLabel: string;
      investorBriefArLabel: string;
      signedDateLabel: string;
      templateLabel: string;
      periodLabelLabel: string;
      periodStartLabel: string;
      periodEndLabel: string;
      deadlineLabel: string;
      emailLabel: string;
      roleLabel: string;
      newPasswordLabel: string;
      inviteStaffTitle: string;
      manageStaffTitle: string;
      staffListCaption: string;
      hasPasswordLabel: string;
      yesLabel: string;
      noLabel: string;
      setPasswordAction: string;
      revokeAction: string;
      addMetricAction: string;
      deleteMetricAction: string;
      removeRowAction: string;
      metricDeletePendingNote: string;
      undoAction: string;
      metricKeyLabel: string;
      metricKeyOptionalLabel: string;
      metricKeyHint: string;
      metricLabelEnLabel: string;
      metricLabelArLabel: string;
      metricDataTypeLabel: string;
      selectPlaceholder: string;
      createCompanyTitle: string;
      createVehicleTitle: string;
      createInvestorTitle: string;
      linkVehicleTitle: string;
      createTemplateTitle: string;
      createCycleTitle: string;
      createInviteTitle: string;
      createInvestorInviteTitle: string;
      investorLabel: string;
      vehiclesListTitle: string;
      investorsListTitle: string;
      industryLabel: string;
      industryOtherEnLabel: string;
      industryOtherArLabel: string;
      founderNameLabel: string;
      founderEmailLabel: string;
      founderPhoneLabel: string;
      hqCityLabel: string;
      hqCountryLabel: string;
      founderSectionTitle: string;
      headquartersLabel: string;
      founderLabel: string;
      sentRequestsTitle: string;
      sentRequestsHint: string;
      addCompaniesAction: string;
      alreadySentLabel: string;
      cancelAction: string;
      newRequestHint: string;
      addingToRequestHint: string;
      companiesListTitle: string;
      editCompanyTitle: string;
      editVehicleTitle: string;
      editInvestorTitle: string;
      editAction: string;
      saveChangesLabel: string;
      emailAgainAction: string;
      importStartupsAction: string;
      importTitle: string;
      importIntro: string;
      importTemplateAction: string;
      importFileLabel: string;
      importCheckAction: string;
      importRunAction: string;
      importReadyCount: string;
      importDoneMessage: string;
      importSkippedNote: string;
      importRowColumn: string;
      importStatusColumn: string;
      importReadyLabel: string;
      importAddedLabel: string;
      importCloseAction: string;
      allDepartmentsOption: string;
      requestDetailTitle: string;
      requestEntryTitle: string;
      requestDetailIntro: string;
      requestStartupsCount: string;
      startupColumn: string;
      cycleColumn: string;
      lastEmailedColumn: string;
      neverEmailedValue: string;
      emailHistoryAction: string;
      dataColumn: string;
      answeredOfLabel: string;
      resendAction: string;
      enterDataAction: string;
      editDataAction: string;
      viewDataAction: string;
      emailSentLabel: string;
      emailFailedLabel: string;
      emailAutomaticLabel: string;
      emailLogUnavailable: string;
      entryIntro: string;
      entrySaveAction: string;
      entrySubmitAction: string;
      entrySubmitHint: string;
      entrySavedMessage: string;
      entrySubmittedMessage: string;
      entryLockedMessage: string;
      goToReviewAction: string;
      openStartupPageAction: string;
      emailKindRequest: string;
      emailKindInvite: string;
      emailKindReminderUpcoming: string;
      emailKindReminderOverdue: string;
      editTemplateTitle: string;
      templatesListTitle: string;
      templateActiveLabel: string;
      templateInactiveLabel: string;
      templateInUseNote: string;
      metricOrderLabel: string;
      metricRequiredLabel: string;
      metricActiveLabel: string;
      metricLockedNote: string;
      deleteSectionTitle: string;
      deleteCompanyWarning: string;
      deleteVehicleWarning: string;
      deleteInvestorWarning: string;
      deleteConfirmLabel: string;
      deleteAction: string;
      successMessage: string;
      inviteCreatedMessage: string;
      auditLogTitle: string;
      auditActorColumn: string;
      auditActionColumn: string;
      auditTargetColumn: string;
      auditWhenColumn: string;
      auditFilterLabel: string;
      auditAllActionsOption: string;
      auditNoEventsMessage: string;
      auditPreviousPageAction: string;
      auditNextPageAction: string;
      copyLinkAction: string;
      linkCopiedMessage: string;
    };
  };
  companyReport: {
    profileTitle: string;
    revenueModelsLabel: string;
    linkedVehiclesTitle: string;
    noVehiclesLinked: string;
    backToRegister: string;
    backToMyCompanies: string;
    backToPrefix: string;
    narrativeTitle: string;
    historyTitle: string;
    noReportingHistory: string;
    revenueLabel: string;
    revenueGrowthLabel: string;
    revenueGrowthVsPrefix: string;
    revenueGrowthNoPriorPeriod: string;
    revenueGrowthInsufficientData: string;
    latestValuationLabel: string;
    valuationAsOfPrefix: string;
    valuationHistoryTitle: string;
    quarterlyToggleLabel: string;
    annuallyToggleLabel: string;
    metricsTitle: string;
    grossMarginLabel: string;
    netMarginLabel: string;
    naValueDisplay: string;
    trendTitle: string;
    quarterlyRevenueTitle: string;
    annualActualLabel: string;
    annualProjectedLabel: string;
    projectionMethodNote: string;
    reportedSeriesLabel: string;
    projectedSeriesLabel: string;
  };
  quarterlyReport: {
    backToReport: string;
    brandSubtitle: string;
    reportedPeriodLabel: string;
    publishedLabel: string;
    printAction: string;
    currentRevenueLabel: string;
    priorRevenueLabel: string;
    projectionLabel: string;
    projectionHint: string;
    chartTitle: string;
    cashRunwayTitle: string;
    cashRunwayEmpty: string;
    cashBalanceSeriesLabel: string;
    comparisonTitle: string;
    comparisonCaption: string;
    metricColumnLabel: string;
    currentColumnLabel: string;
    priorColumnLabel: string;
    qoqGrowthColumnLabel: string;
    growthIndicatorsTitle: string;
    customerMetricsTitle: string;
    disclaimerText: string;
    viewFormattedReportLabel: string;
    viewLatestReportLabel: string;
    burnRateLabel: string;
    runwayLabel: string;
    monthsUnit: string;
    cashBalanceHint: string;
    notPublishedMessage: string;
  };
  vehicleReport: {
    backToDirectory: string;
    companiesLabel: string;
    companiesTableTitle: string;
    noCompaniesLinked: string;
    investorsTitle: string;
    noInvestorsLinked: string;
    investedCapitalLabel: string;
    latestValuationLabel: string;
    latestValuationAsOf: string;
    noValuationRecorded: string;
    capTableTitle: string;
    capTableCaption: string;
    investorColumn: string;
    contributedCapitalColumn: string;
    netInvestedCapitalColumn: string;
    ownershipColumn: string;
    totalRow: string;
    trendsTitle: string;
  };
  submitReport: {
    formTitle: string;
    openFormLinkLabel: string;
    backToCompanyReport: string;
    lockedMessage: string;
    noActiveCycleMessage: string;
    metricsNotConfiguredMessage: string;
    metricsIncompleteMessage: string;
    sectionFinancial: string;
    sectionHealth: string;
    sectionCustomer: string;
    sectionQualitative: string;
    saveAction: string;
    saving: string;
    savedMessage: string;
    naLabel: string;
    attachmentsTitle: string;
    uploadAction: string;
    uploading: string;
    noAttachmentsMessage: string;
    auditedFinancialsCheckboxLabel: string;
    auditedFinancialsBadge: string;
    uploadErrorMessage: string;
  };
  reviewWorkspace: {
    subtitle: string;
    statusActionableOption: string;
    searchPlaceholder: string;
    reviewAction: string;
    actionPanelTitle: string;
    selectPrompt: string;
    startReviewAction: string;
    requestChangesAction: string;
    approveAction: string;
    publishAction: string;
    noActionAvailable: string;
    narrativeEnLabel: string;
    narrativeArLabel: string;
    narrativeKinds: {
      operational_update: string;
      quarter_highlights: string;
      investment_review_notes: string;
      management_commentary: string;
    };
    saveCorrectionsAction: string;
    reportsLogTitle: string;
    reportsLogCaption: string;
    requestedColumn: string;
    publishedColumn: string;
    notPublishedValue: string;
    editDeadlineAction: string;
    newDeadlineLabel: string;
    saveDeadlineAction: string;
    cancelAction: string;
    downloadReportAction: string;
    resendToInvestorsAction: string;
    resendPending: string;
    resendSuccessMessage: string;
    sentCountLabel: string;
    pendingCountLabel: string;
    failedCountLabel: string;
    distributionColumn: string;
  };
  investorDashboard: {
    subtitle: string;
    investorSelectLabel: string;
    companiesInScopeLabel: string;
    vehicleExposureTitle: string;
    visibleCompaniesLabel: string;
    noStartupsInVehicle: string;
    companiesTableTitle: string;
    companiesTableCaption: string;
    noApprovedReports: string;
    noOrgAccess: string;
    investedCapitalLabel: string;
    latestNewsTitle: string;
    noNewsMessage: string;
    sectorDistributionTitle: string;
    noSectorDataMessage: string;
    navChartTitle: string;
    navSeriesLabel: string;
    noNavMessage: string;
    attachmentsLabel: string;
    returnsTitle: string;
    noReturnsMessage: string;
    contributedLabel: string;
    distributedLabel: string;
    currentValueLabel: string;
    moicLabel: string;
    irrLabel: string;
    irrNotAvailableLabel: string;
  };
  companyRegister: {
    subtitle: string;
    periodColumnLabel: string;
    overdueColumnLabel: string;
    registerCaption: string;
    emptyRegisterMessage: string;
    searchPlaceholder: string;
  };
  vehicleDirectory: {
    subtitle: string;
    emptyMessage: string;
  };
  submitPortal: {
    subtitle: string;
    noMembershipsMessage: string;
    willOpenEditableMessage: string;
    willOpenLockedMessage: string;
  };
  notFound: {
    title: string;
    description: string;
    backToHome: string;
  };
  home: {
    title: string;
    subtitle: string;
    openAdmin: string;
    tagline: string;
    signInHeading: string;
    signUpHeading: string;
    signUpPrompt: string;
  };
  signUp: {
    pageTitle: string;
    emailLabel: string;
    roleLabel: string;
    roleOptions: { MANAGEMENT: string; INVESTMENT_PROFESSIONAL: string; INVESTOR: string };
    organizationLabel: string;
    organizationHint: string;
    messageLabel: string;
    submitAction: string;
    submitting: string;
    successMessage: string;
    existingAccountError: string;
    alreadyPendingError: string;
    genericError: string;
  };
  pendingApproval: {
    title: string;
    description: string;
  };
  companyProfile: {
    subtitle: string;
    openProfileAction: string;
    editDetailsAction: string;
    archivedNote: string;
    tabOverview: string;
    tabReports: string;
    tabDashboard: string;
    statReports: string;
    statReportsValue: string;
    statLatestRevenue: string;
    statTotalInvested: string;
    statLatestValuation: string;
    investmentsTitle: string;
    noInvestments: string;
    signedColumn: string;
    amountColumn: string;
    ownershipColumn: string;
    reportsTitle: string;
    noReports: string;
    templateColumn: string;
    viewOnDashboardAction: string;
    formattedReportAction: string;
    correctAction: string;
    removeAction: string;
    removeConfirm: string;
    correctionNote: string;
  };
  lists: {
    searchPlaceholder: string;
    clearSearch: string;
    sortLabel: string;
    noMatches: string;
    showingCount: string;
    recentlyUpdated: string;
    oldestFirst: string;
    newestFirst: string;
    nameAsc: string;
    nameDesc: string;
    amountDesc: string;
    amountAsc: string;
    periodDesc: string;
    periodAsc: string;
    deadlineAsc: string;
    emailAsc: string;
    roleAsc: string;
    ownershipDesc: string;
    revenueDesc: string;
    growthDesc: string;
    runwayAsc: string;
    statusAsc: string;
    sectorAsc: string;
    stageAsc: string;
    lastUpdatedDesc: string;
    mostStartups: string;
    mostInvestors: string;
    navDesc: string;
    moicDesc: string;
    vintageDesc: string;
    burnDesc: string;
    investmentYearDesc: string;
    overdueDesc: string;
  };
  access: {
    subtitle: string;
    viewOnlyNote: string;
    pendingRequestsTitle: string;
    noPendingRequests: string;
    requestedLabel: string;
    organizationRequestedLabel: string;
    messageLabel: string;
    approveAction: string;
    rejectAction: string;
    approveGrantLabel: string;
    approveOrgLabel: string;
    confirmReject: string;
    companiesTitle: string;
    investorsTitle: string;
    noOrgs: string;
    summaryCounts: string;
    membersLabel: string;
    pendingInvitesLabel: string;
    noMembers: string;
    noInvites: string;
    roles: { ADMIN: string; MEMBER: string };
    joinedLabel: string;
    sentLabel: string;
    expiresLabel: string;
    revokeAction: string;
    cancelInviteAction: string;
    confirmRevoke: string;
    confirmCancelInvite: string;
  };
}

export const en = {
  common: {
    appName: "Falak Portfolio Platform",
  },
  nav: {
    portfolioDashboard: "Portfolio Dashboard",
    companyList: "Company List",
    managePortfolio: "Manage Portfolio",
    investorDashboard: "Investor Dashboard",
    vehicleDashboard: "Vehicle Dashboard",
    companyReports: "Company Reports",
    startupForm: "My Companies",
    reviewWorkspace: "Reports Review and Approval",
    access: "Access Management",
    openMenu: "Open menu",
    back: "Back",
    closeMenu: "Close menu",
    signOut: "Sign out",
  },
  language: {
    ariaSwitchToArabic: "Switch to Arabic",
    ariaSwitchToEnglish: "Switch to English",
    buttonLabelAr: "العربية",
    buttonLabelEn: "English",
  },
  theme: {
    ariaSwitchToDark: "Switch to dark theme",
    ariaSwitchToLight: "Switch to light theme",
  },
  status: {
    draft: { label: "Draft", description: "Not yet submitted by the company" },
    submitted: { label: "Submitted", description: "Awaiting Falak review" },
    under_review: { label: "Under Review", description: "Falak is reviewing the submission" },
    changes_requested: { label: "Changes Requested", description: "Falak requested corrections from the company" },
    approved: { label: "Approved", description: "Approved, pending publication" },
  },
  stages: {
    PreSeed: "Pre-Seed",
    BridgeToSeed: "Bridge to Seed",
    Seed: "Seed",
    PreSeriesA: "Pre-Series A",
    BridgeToSeriesA: "Bridge to Series A",
    SeriesA: "Series A",
    SeriesB: "Series B",
    Later: "Later Stage",
  },
  customerModels: {
    B2B: "Business-to-Business (B2B)",
    B2C: "Business-to-Consumer (B2C)",
    B2B_B2C: "B2B & B2C",
    B2B2C: "Business-to-Business-to-Consumer (B2B2C)",
    B2G: "Business-to-Government (B2G)",
    C2C: "Consumer-to-Consumer (C2C)",
    D2C: "Direct-to-Consumer (D2C)",
  },
  revenueModels: {
    SaaS: "SaaS",
    Marketplace: "Marketplace",
    ECommerce: "E-Commerce",
    TransactionBased: "Transaction-Based",
    Subscription: "Subscription",
    Other: "Other",
  },
  currencyNames: {
    SAR: "Saudi Riyal (SAR)",
    USD: "US Dollar (USD)",
  },
  vehicleTypes: {
    Fund: "Fund",
    SPV: "SPV",
  },
  investorTypes: {
    Institutional: "Institutional",
    FamilyOffice: "Family Office",
    Individual: "Individual",
  },
  departments: {
    VentureBuilder: "Venture Builder",
    InvestmentDepartment: "Investment Department",
  },
  staffRoleNames: {
    FALAK_ADMIN: "Admin",
    FALAK_MANAGEMENT: "Management",
    FALAK_OPERATIONS: "Investment Professional",
  },
  valuationTypes: {
    LastRound: "Last Round",
    InternalMark: "Internal Mark",
    ThirdPartyMark: "Third-Party Mark",
    Exit: "Exit",
    WrittenOff: "Written Off",
  },
  capitalTransactionTypes: {
    CapitalCall: "Capital Call",
    Contribution: "Contribution",
    Distribution: "Distribution",
    ManagementFee: "Management Fee",
  },
  admin: {
    title: "Falak Admin — Portfolio Dashboard",
    subtitle: "Org-wide visibility across all portfolio companies, vehicles, and reporting cycles.",
    dashboardPeriodLabel: "Reporting Period",
    companyListTitle: "Company List",
    exportCompaniesLabel: "Export to Excel",
    exportPortfolioLabel: "Export Portfolio to Excel",
    companyListSubtitle: "Every portfolio company, filterable by vehicle, period, currency, and status.",
    kpi: {
      companiesLabel: "Portfolio Companies",
      vehiclesLabel: "Investment Vehicles",
      investorsLabel: "Investors",
      completionLabel: "Reporting Completion",
      completionHint: "Approved for the selected period",
      overdueLabel: "Overdue Submissions",
      revenueSectionLabel: "Total Reported Revenue",
      noCrossCurrencyNote: "Shown separately per currency — never combined",
      excludesPrefix: "Excludes",
      excludesSuffixSingular: "company with no data submitted this period",
      summaryLabel: "Portfolio Summary",
    },
    reportingStatusPanel: {
      title: "Reporting Status",
      lastUpdatedColumn: "Last Updated",
      deadlineColumn: "Deadline",
      neverSubmitted: "Not yet submitted",
      daysOverdueSuffix: "days overdue",
      withinDeadline: "Within deadline",
    },
    alerts: {
      title: "Portfolio Alerts",
      noAlerts: "No open alerts across the portfolio.",
      severityHigh: "High",
      severityMedium: "Medium",
      reportingOverduePrefix: "Reporting deadline passed",
      lowRunwaySingular: "month of runway",
      lowRunwayPlural: "months of runway",
      overduePayables: "Overdue payables reported",
      overdueReceivables: "Overdue receivables reported",
    },
    filters: {
      title: "Company List Filters",
      scopeNote: "Filters apply to the company list below.",
      searchLabel: "Search",
      searchPlaceholder: "Search company, sector, or vehicle",
      clearSearchAriaLabel: "Clear search",
      vehicleLabel: "Vehicle",
      periodLabel: "Reporting Period",
      currencyLabel: "Currency",
      statusLabel: "Status",
      investmentYearLabel: "Investment Year",
      allOption: "All",
      resetFilters: "Reset filters",
      viewTable: "Table view",
      viewCards: "Card view",
    },
    table: {
      caption: "Portfolio companies with their reporting status, vehicle, and latest reported revenue",
      companyColumn: "Company",
      sectorColumn: "Sector",
      customerModelColumn: "Customer Model",
      entryStageColumn: "Entry Stage",
      currentStageColumn: "Current Stage",
      vehicleColumn: "Vehicle",
      revenueColumn: "Revenue",
      statusColumn: "Status",
      lastUpdatedColumn: "Last Updated",
      viewCompanyAction: "View report",
      noDataValue: "No data submitted",
      departmentColumn: "Department",
      investmentYearColumn: "Investment Year",
      grossMarginColumn: "Gross Margin",
      cashBurnColumn: "Cash Burn",
      noVehicleValue: "Direct holding",
    },
    emptyState: "No companies match the selected filters.",
    charts: {
      moreSeriesLabel: "+{count} more",
      otherSliceLabel: "Other",
      valuationAxisLabel: "Valuation",
      burnLabel: "Burn",
      percentileLabel: "percentile",
      navPanelTitle: "Portfolio NAV",
      companyTrendsCaption: "Revenue and burn trend by company, most recent two periods",
      revenueGrowthQoqColumn: "Revenue Growth (QoQ)",
      burnChangeQoqColumn: "Burn Change (QoQ)",
      runwayColumn: "Runway",
      noTrendDataMessage: "No reporting history yet for the selected scope.",
      investedCapitalLabel: "Invested Capital",
      portfolioMoicLabel: "Blended MOIC",
      moicNotAvailableLabel: "Not available",
      noDataMessage: "No data recorded yet.",
      currencyToggleLabel: "Display Currency",
      totalLabel: "Total",
      byVehicleLabel: "By Vehicle",
      byDepartmentLabel: "By Department",
      allOption: "All",
      startupCountChartTitle: "No. of Portfolio Startups",
      investedCapitalChartTitle: "Total Invested Capital",
      navChartTitle: "NAV",
      marketCapChartTitle: "Market Cap",
      marketCapByStartupChartTitle: "Market Cap by Startup",
      vintageVsInvestmentChartTitle: "Fund Vintage Year vs. Startup Investment Year",
      reportingStatusChartTitle: "Startup Reporting",
      fundsFormedLabel: "Funds Formed",
      startupsInvestedLabel: "Startups Invested",
      submissionViewLabel: "Submission Status",
      auditedViewLabel: "Audited Status",
      submittedLabel: "Submitted",
      notSubmittedLabel: "Not Submitted",
      auditedLabel: "Audited Financials Submitted",
      notAuditedLabel: "Audited Financials Not Submitted",
      fundListTitle: "Fund List",
      fundNameColumn: "Fund Name",
      navColumn: "NAV",
      numberOfInvestorsColumn: "No. of Investors",
      sectorDistributionChartTitle: "Sector Distribution",
      vehicleDistributionChartTitle: "Vehicle Distribution",
      stageDistributionChartTitle: "Stage Distribution",
      investmentYearChartTitle: "Startups Invested per Year",
    },
    manage: {
      sectionTitle: "Manage Portfolio",
      indexSubtitle: "Create and manage companies, vehicles, investors, reporting templates and cycles, and invites.",
      invitesSectionTitle: "Investor & Company Invite",
      vehicleAssignmentTitle: "Company Assignment to Vehicle",
      investorVehicleAssignmentTitle: "Investor Assignment to Vehicle",
      investorVehicleAssignmentsCaption: "Investors currently assigned to a vehicle, and so receiving reports from its startups.",
      effectiveFromLabel: "Effective From",
      commitmentAmountLabel: "Contributions (Net Invested)",
      ownershipPctAutoHint: "Ownership % is calculated automatically: contributions ÷ the vehicle's total invested capital.",
      unassignAction: "Unassign",
      recordCompanyValuationTitle: "Record Company Valuation",
      recordVehicleValuationTitle: "Record Vehicle Valuation",
      recordCapitalTransactionTitle: "Record Capital Transaction",
      amountLabel: "Amount",
      transactionDateLabel: "Transaction Date",
      descriptionLabel: "Description",
      valuationAmountLabel: "Valuation Amount",
      navAmountLabel: "NAV Amount",
      valuationTypeLabel: "Valuation Type",
      asOfDateLabel: "As of Date",
      sourceLabel: "Source (optional)",
      nameEnLabel: "Name (English)",
      nameArLabel: "Name (Arabic)",
      slugLabel: "Slug (used in URLs, e.g. my-company)",
      sectorEnLabel: "Sector (English)",
      sectorArLabel: "Sector (Arabic)",
      customerModelLabel: "Customer Model",
      revenueModelsLabel: "Revenue Models",
      currencyLabel: "Currency",
      entryStageLabel: "Entry Stage",
      currentStageLabel: "Current Stage",
      departmentLabel: "Department",
      vintageYearLabel: "Vintage Year",
      setDepartmentTitle: "Set Company Department",
      setVintageYearTitle: "Set Vehicle Vintage Year",
      typeLabel: "Type",
      submitLabel: "Create",
      archiveAction: "Archive",
      companyLabel: "Company",
      companiesLabel: "Companies",
      vehicleLabel: "Vehicle",
      investedAmountLabel: "Invested Amount",
      ownershipPctLabel: "Ownership % (e.g. 0.10 for 10%)",
      ownershipPctOptionalLabel: "Ownership % (optional, e.g. 0.10 for 10%)",
      vehicleDescriptionEnLabel: "Description (English, optional)",
      vehicleDescriptionArLabel: "Description (Arabic, optional)",
      investorEmailLabel: "Email (optional)",
      investorPhoneLabel: "Phone number (optional)",
      investorBriefEnLabel: "Brief (English, optional)",
      investorBriefArLabel: "Brief (Arabic, optional)",
      signedDateLabel: "Signed Date",
      templateLabel: "Reporting Template",
      periodLabelLabel: "Period Label (e.g. Q3 2026)",
      periodStartLabel: "Period Start",
      periodEndLabel: "Period End",
      deadlineLabel: "Submission Deadline",
      emailLabel: "Email",
      roleLabel: "Role",
      newPasswordLabel: "New Password",
      inviteStaffTitle: "Invite Staff User",
      manageStaffTitle: "Manage Staff",
      staffListCaption: "Falak staff accounts, their role, and their department.",
      hasPasswordLabel: "Password Set",
      yesLabel: "Yes",
      noLabel: "No",
      setPasswordAction: "Set Password",
      revokeAction: "Revoke",
      addMetricAction: "Add another metric",
      deleteMetricAction: "Delete metric",
      removeRowAction: "Remove",
      metricDeletePendingNote: "{name} will be deleted when you save. Values already reported for it stay in past reports.",
      undoAction: "Undo",
      metricKeyLabel: "Metric Key (e.g. revenue_b2b)",
      metricKeyOptionalLabel: "Metric Key (optional)",
      metricKeyHint: "Leave the key empty to create it from the English label (\"Revenue B2B\" becomes revenue_b2b). Any spelling you type is converted the same way. Empty rows are ignored.",
      metricLabelEnLabel: "Metric Label (English)",
      metricLabelArLabel: "Metric Label (Arabic)",
      metricDataTypeLabel: "Data Type",
      selectPlaceholder: "Select...",
      createCompanyTitle: "New Company",
      createVehicleTitle: "New Vehicle",
      createInvestorTitle: "New Investor",
      linkVehicleTitle: "Link Vehicle to Company",
      createTemplateTitle: "New Reporting Template",
      createCycleTitle: "New Reporting Cycle",
      createInviteTitle: "Send Company Invite",
      createInvestorInviteTitle: "Send Investor Invite",
      investorLabel: "Investor",
      vehiclesListTitle: "Vehicles",
      investorsListTitle: "Investors",
      industryLabel: "Industry",
      industryOtherEnLabel: "Industry (English)",
      industryOtherArLabel: "Industry (Arabic)",
      founderNameLabel: "Founder Name",
      founderEmailLabel: "Founder Email",
      founderPhoneLabel: "Founder Phone",
      hqCityLabel: "HQ City",
      hqCountryLabel: "HQ Country",
      founderSectionTitle: "Founder & Headquarters",
      headquartersLabel: "Headquarters",
      founderLabel: "Founder",
      sentRequestsTitle: "Requests Already Sent",
      sentRequestsHint: "Use \"Add Companies\" to send the same template and period to more startups.",
      addCompaniesAction: "Add Companies",
      alreadySentLabel: "already sent",
      cancelAction: "Cancel",
      newRequestHint: "Choose the startups, template, period and deadline for a new reporting request.",
      addingToRequestHint: "Adding startups to this request. Template, period and deadline are kept from the original.",
      companiesListTitle: "Startups",
      editCompanyTitle: "Edit Startup",
      editVehicleTitle: "Edit Vehicle",
      editInvestorTitle: "Edit Investor",
      editAction: "Edit",
      saveChangesLabel: "Save Changes",
      emailAgainAction: "Email again",
      importStartupsAction: "Import from Excel",
      importTitle: "Import startups from Excel",
      importIntro: "Add many startups at once: download the template, fill in one startup per row, then upload it and click Check file. Every row is checked with the same rules as the form below, and nothing is added until you click Import.",
      importTemplateAction: "Download template",
      importFileLabel: "Excel file (.xlsx)",
      importCheckAction: "Check file",
      importRunAction: "Import {count} startup(s)",
      importReadyCount: "{ready} of {total} rows are ready to import. Rows with problems are skipped.",
      importDoneMessage: "Imported {count} startup(s).",
      importSkippedNote: "Rows with problems were skipped: fix them in the file and import it again (startups already added are skipped automatically).",
      importRowColumn: "Row",
      importStatusColumn: "Result",
      importReadyLabel: "Ready",
      importAddedLabel: "Added",
      importCloseAction: "Close",
      allDepartmentsOption: "Both departments",
      requestDetailTitle: "Report request",
      requestEntryTitle: "Enter report data",
      requestDetailIntro: "Every startup this request went to, every email sent about it, and where each report stands. Use Enter data when figures reach you another way (by email or in a meeting): they go into the startup's report exactly as if the startup had filled in the form.",
      requestStartupsCount: "{count} startup(s) · {submitted} submitted",
      startupColumn: "Startup",
      cycleColumn: "Reporting cycle",
      lastEmailedColumn: "Last emailed",
      neverEmailedValue: "Not emailed yet",
      emailHistoryAction: "{count} email(s)",
      dataColumn: "Data entered",
      answeredOfLabel: "{answered} of {total} fields",
      resendAction: "Resend",
      enterDataAction: "Enter data",
      editDataAction: "Edit data",
      viewDataAction: "View data",
      emailSentLabel: "Sent",
      emailFailedLabel: "Failed",
      emailAutomaticLabel: "automatic",
      emailLogUnavailable: "The email history can't be shown right now.",
      entryIntro: "Figures entered here are saved to {startup}'s {period} report, exactly as if the startup had entered them, and are recorded in the audit log.",
      entrySaveAction: "Save",
      entrySubmitAction: "Save and submit for review",
      entrySubmitHint: "Submitting moves the report to Review, where it is approved and published to the quarterly report.",
      entrySavedMessage: "Saved.",
      entrySubmittedMessage: "Saved and submitted. Approve and publish it from Review.",
      entryLockedMessage: "This report has been approved or published, so its figures are shown read-only.",
      goToReviewAction: "Open Review",
      openStartupPageAction: "Startup page",
      emailKindRequest: "Request",
      emailKindInvite: "Founder invitation",
      emailKindReminderUpcoming: "Deadline reminder",
      emailKindReminderOverdue: "Overdue reminder",
      editTemplateTitle: "Edit Reporting Template",
      templatesListTitle: "Templates",
      templateActiveLabel: "Active (offered for new reporting cycles)",
      templateInactiveLabel: "inactive",
      templateInUseNote: "Used by {count} reporting cycle(s). Changes apply to those cycles too.",
      metricOrderLabel: "Order",
      metricRequiredLabel: "Required",
      metricActiveLabel: "Shown on the form",
      metricLockedNote: "Key and data type are locked because startups have entered values for this metric.",
      deleteSectionTitle: "Delete",
      deleteCompanyWarning: "Removes this startup from every list, dashboard and portal, ends its users' access and cancels its pending invites. Its name can be reused for a new startup. Its history is kept in the database for the audit trail, but it cannot be restored from the platform.",
      deleteVehicleWarning: "Removes this vehicle from every list, dashboard and portal (the startups it holds stay). Its name can be reused. Its history is kept in the database for the audit trail, but it cannot be restored from the platform.",
      deleteInvestorWarning: "Removes this investor from every list and dashboard, ends its users' access to the investor portal, cancels its pending invites and closes its vehicle positions, so it receives no further reports. Its history is kept in the database for the audit trail, but it cannot be restored from the platform.",
      deleteConfirmLabel: "To confirm, type the English name:",
      deleteAction: "Delete",
      successMessage: "Saved.",
      inviteCreatedMessage: "Invite created. Copy this link and send it to the company yourself — email delivery isn't wired up yet.",
      auditLogTitle: "Audit Log",
      auditActorColumn: "Actor",
      auditActionColumn: "Action",
      auditTargetColumn: "Target",
      auditWhenColumn: "When",
      auditFilterLabel: "Action",
      auditAllActionsOption: "All actions",
      auditNoEventsMessage: "No audit events found.",
      auditPreviousPageAction: "Previous",
      auditNextPageAction: "Next",
      copyLinkAction: "Copy link",
      linkCopiedMessage: "Copied.",
    },
  },
  companyReport: {
    profileTitle: "Company Profile",
    revenueModelsLabel: "Revenue Models",
    linkedVehiclesTitle: "Linked Investment Vehicles",
    noVehiclesLinked: "No investment vehicle linked",
    backToRegister: "Back to Company Reports",
    backToMyCompanies: "Back to My Companies",
    backToPrefix: "Back to",
    narrativeTitle: "Narrative",
    historyTitle: "Reporting History",
    noReportingHistory: "No reporting cycles have been created for this company yet.",
    revenueLabel: "Revenue",
    revenueGrowthLabel: "Revenue Growth",
    revenueGrowthVsPrefix: "vs.",
    revenueGrowthNoPriorPeriod: "No prior period to compare",
    revenueGrowthInsufficientData: "Insufficient comparable revenue data",
    latestValuationLabel: "Latest Valuation",
    valuationAsOfPrefix: "As of",
    valuationHistoryTitle: "Valuation Over Time",
    quarterlyToggleLabel: "Quarterly",
    annuallyToggleLabel: "Annually",
    metricsTitle: "Operating Metrics",
    grossMarginLabel: "Gross Margin",
    netMarginLabel: "Net Margin",
    naValueDisplay: "N/A",
    trendTitle: "Revenue & Burn Trend",
    quarterlyRevenueTitle: "Quarterly Revenue",
    annualActualLabel: "Annual Revenue (Actual)",
    annualProjectedLabel: "Annualized Revenue (Projected)",
    projectionMethodNote: "Reported quarters to date, plus the latest quarter repeated for each remaining quarter.",
    reportedSeriesLabel: "Reported",
    projectedSeriesLabel: "Projected",
  },
  quarterlyReport: {
    backToReport: "Back to Company Report",
    brandSubtitle: "FALAK ANGELS · Powered by Falak Ventures",
    reportedPeriodLabel: "Reported Period",
    publishedLabel: "Published",
    printAction: "Print / Save as PDF",
    currentRevenueLabel: "Current Quarter Revenue",
    priorRevenueLabel: "Prior Quarter Revenue",
    projectionLabel: "Annualized Revenue Projection",
    projectionHint: "Current quarter revenue × 4",
    chartTitle: "Revenue Trend & Projection",
    cashRunwayTitle: "Cash & Runway",
    cashRunwayEmpty: "No cash or runway figures reported yet.",
    cashBalanceSeriesLabel: "Cash balance",
    comparisonTitle: "Financial Comparison",
    comparisonCaption: "Current period compared with the prior reporting period",
    metricColumnLabel: "Metric",
    currentColumnLabel: "Current",
    priorColumnLabel: "Prior",
    qoqGrowthColumnLabel: "QoQ Growth",
    growthIndicatorsTitle: "Growth & Efficiency Indicators",
    customerMetricsTitle: "Customer Metrics",
    disclaimerText:
      "Figures are self-reported by the company and compiled by Falak Ventures for informational purposes only. This document does not constitute investment advice.",
    viewFormattedReportLabel: "View Formatted Report",
    viewLatestReportLabel: "View Latest Report",
    burnRateLabel: "Burn Rate (monthly)",
    runwayLabel: "Runway",
    monthsUnit: "months",
    cashBalanceHint: "Cash balance:",
    notPublishedMessage: "A formatted report is not yet available for this period.",
  },
  vehicleReport: {
    backToDirectory: "Back to Vehicles",
    companiesLabel: "Companies",
    companiesTableTitle: "Companies in this Vehicle",
    noCompaniesLinked: "No companies currently linked to this vehicle.",
    investorsTitle: "Investors",
    noInvestorsLinked: "No investor currently linked",
    investedCapitalLabel: "Invested Capital",
    latestValuationLabel: "Latest Valuation",
    latestValuationAsOf: "As of",
    noValuationRecorded: "No valuation recorded yet",
    capTableTitle: "Cap Table",
    capTableCaption: "Each investor's contributed capital, net invested capital, and ownership of this vehicle.",
    investorColumn: "Investor",
    contributedCapitalColumn: "Contributed Capital",
    netInvestedCapitalColumn: "Net Invested Capital",
    ownershipColumn: "Ownership",
    totalRow: "Total",
    trendsTitle: "Company Performance Trends",
  },
  submitReport: {
    formTitle: "Reporting Form",
    openFormLinkLabel: "Open Reporting Form",
    backToCompanyReport: "Back to Company Report",
    lockedMessage: "This report can no longer be edited here.",
    noActiveCycleMessage: "There is no active reporting cycle for this company right now.",
    metricsNotConfiguredMessage:
      "Report data entry is not yet connected — it depends on Falak's reporting template, which has not been defined yet.",
    metricsIncompleteMessage: "This report is missing required information and cannot be submitted yet.",
    sectionFinancial: "Financial Performance",
    sectionHealth: "Performance & Health",
    sectionCustomer: "Customer & Growth Metrics",
    sectionQualitative: "Qualitative",
    saveAction: "Save",
    saving: "Saving...",
    savedMessage: "Saved.",
    naLabel: "N/A",
    attachmentsTitle: "Attachments",
    uploadAction: "Upload File",
    uploading: "Uploading...",
    noAttachmentsMessage: "No files uploaded yet.",
    auditedFinancialsCheckboxLabel: "This file is the audited financial statements",
    auditedFinancialsBadge: "Audited financials",
    uploadErrorMessage: "Choose a file to upload.",
  },
  reviewWorkspace: {
    subtitle: "Review submitted reports and manage their approval status.",
    statusActionableOption: "Actionable (Submitted + Under Review + Approved)",
    searchPlaceholder: "Search company or sector",
    reviewAction: "Review",
    actionPanelTitle: "Review Action",
    selectPrompt: "Select a report from the queue below to review it.",
    startReviewAction: "Start Review",
    requestChangesAction: "Request Changes",
    approveAction: "Approve",
    publishAction: "Publish",
    noActionAvailable: "No review action is available for this status.",
    narrativeEnLabel: "English",
    narrativeArLabel: "Arabic",
    narrativeKinds: {
      operational_update: "Operational Update",
      quarter_highlights: "Quarter Highlights",
      investment_review_notes: "Investment Review Notes",
      management_commentary: "Management Commentary",
    },
    saveCorrectionsAction: "Save Corrections",
    reportsLogTitle: "Reports Log",
    reportsLogCaption: "Every reporting cycle requested, per company and vehicle, with its current status.",
    requestedColumn: "Requested",
    publishedColumn: "Published",
    notPublishedValue: "Not yet published",
    editDeadlineAction: "Edit Deadline",
    newDeadlineLabel: "New Deadline",
    saveDeadlineAction: "Save",
    cancelAction: "Cancel",
    downloadReportAction: "Download Report",
    resendToInvestorsAction: "Resend to Investors",
    resendPending: "Sending...",
    resendSuccessMessage: "Report sent to investors.",
    sentCountLabel: "Sent",
    pendingCountLabel: "Pending",
    failedCountLabel: "Failed",
    distributionColumn: "Sent to Investors",
  },
  investorDashboard: {
    subtitle: "Vehicle exposure and published company reports visible to your investor organization.",
    investorSelectLabel: "Investor",
    companiesInScopeLabel: "Companies",
    vehicleExposureTitle: "Vehicle Exposure",
    visibleCompaniesLabel: "Visible companies this period",
    noStartupsInVehicle: "No startups linked to this vehicle yet.",
    companiesTableTitle: "Companies",
    companiesTableCaption: "Companies visible to this investor for the selected period, approved only",
    noApprovedReports: "No published reports for this organization and period yet.",
    noOrgAccess: "You don't have access to any investor organization yet.",
    investedCapitalLabel: "Invested Capital",
    latestNewsTitle: "Latest News",
    noNewsMessage: "No updates yet. News appears here once a startup's latest report includes Investment Review Notes.",
    sectorDistributionTitle: "Startups by Sector",
    noSectorDataMessage: "No startups in your vehicles yet.",
    navChartTitle: "NAV",
    navSeriesLabel: "Your NAV",
    noNavMessage: "No NAV has been recorded for your vehicles yet.",
    attachmentsLabel: "Attachments",
    returnsTitle: "Returns",
    noReturnsMessage: "No capital transactions recorded yet for this organization.",
    contributedLabel: "Contributed",
    distributedLabel: "Distributed",
    currentValueLabel: "Current Value",
    moicLabel: "MOIC",
    irrLabel: "IRR",
    irrNotAvailableLabel: "Not available",
  },
  companyRegister: {
    subtitle: "Every company's reporting record across all periods, browsable and filterable.",
    periodColumnLabel: "Period",
    overdueColumnLabel: "Overdue",
    registerCaption: "One row per company and reporting period, ordered by period with the newest first.",
    emptyRegisterMessage: "No reporting records match the current filters.",
    searchPlaceholder: "Search company or sector",
  },
  vehicleDirectory: {
    subtitle: "Browse every Falak investment vehicle and open its dashboard.",
    emptyMessage: "No investment vehicles are available yet.",
  },
  submitPortal: {
    subtitle: "Your companies and where each one's current report stands.",
    noMembershipsMessage: "You aren't a member of any company yet. Company members are added by invitation.",
    willOpenEditableMessage: "This report is open for editing.",
    willOpenLockedMessage: "This report is locked while it's in review or approved.",
  },
  notFound: {
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist or may have moved.",
    backToHome: "Back to Home",
  },
  home: {
    title: "Falak Portfolio Platform",
    subtitle: "Portfolio reporting for Falak, its portfolio companies, and investors.",
    openAdmin: "Open Portfolio Overview",
    tagline: "Quarterly reporting, review, and investor access for Falak's portfolio — in one place.",
    signInHeading: "Sign in",
    signUpHeading: "Request access",
    signUpPrompt: "New here? Submit a request and Falak will grant access once it's approved.",
  },
  signUp: {
    pageTitle: "Request access",
    emailLabel: "Email",
    roleLabel: "I am a...",
    roleOptions: {
      MANAGEMENT: "Falak Management",
      INVESTMENT_PROFESSIONAL: "Falak Investment Professional",
      INVESTOR: "Investor",
    },
    organizationLabel: "Investor organization",
    organizationHint: "The fund, SPV, or firm you represent.",
    messageLabel: "Message (optional)",
    submitAction: "Submit request",
    submitting: "Submitting...",
    successMessage: "Your request has been received. Falak will email you once it's approved.",
    existingAccountError: "An account already exists for this email. Sign in instead.",
    alreadyPendingError: "A request for this email is already pending review.",
    genericError: "Something went wrong. Try again in a moment.",
  },
  pendingApproval: {
    title: "Pending approval",
    description: "Your access request is still under review. Falak will email you once it's approved.",
  },
  companyProfile: {
    subtitle: "Startup profile",
    openProfileAction: "Open startup profile",
    editDetailsAction: "Edit details",
    archivedNote: "This startup is archived.",
    tabOverview: "Overview",
    tabReports: "Reports",
    tabDashboard: "Dashboard",
    statReports: "Reports submitted",
    statReportsValue: "{submitted} of {total}",
    statLatestRevenue: "Latest reported revenue",
    statTotalInvested: "Total invested",
    statLatestValuation: "Latest valuation",
    investmentsTitle: "Investments",
    noInvestments: "No investments recorded yet.",
    signedColumn: "Signed",
    amountColumn: "Invested",
    ownershipColumn: "Ownership",
    reportsTitle: "All reports",
    noReports: "No reports have been requested from this startup yet.",
    templateColumn: "Template",
    viewOnDashboardAction: "View dashboard",
    formattedReportAction: "Formatted report",
    correctAction: "Correct",
    removeAction: "Remove",
    removeConfirm: "Remove this investment? It will stop counting in every total; the record stays in the audit history.",
    correctionNote: "Saving replaces this record with the corrected one; the original stays in the audit history.",
  },
  lists: {
    searchPlaceholder: "Search…",
    clearSearch: "Clear search",
    sortLabel: "Sort",
    noMatches: "Nothing matches your search.",
    showingCount: "Showing {shown} of {total}",
    recentlyUpdated: "Recently added or edited",
    oldestFirst: "Oldest first",
    newestFirst: "Newest first",
    nameAsc: "Name (A–Z)",
    nameDesc: "Name (Z–A)",
    amountDesc: "Highest amount",
    amountAsc: "Lowest amount",
    periodDesc: "Latest period",
    periodAsc: "Earliest period",
    deadlineAsc: "Deadline (soonest)",
    emailAsc: "Email (A–Z)",
    roleAsc: "Role",
    ownershipDesc: "Highest ownership",
    revenueDesc: "Highest revenue",
    growthDesc: "Highest growth",
    runwayAsc: "Shortest runway",
    statusAsc: "Status",
    sectorAsc: "Industry (A–Z)",
    stageAsc: "Stage",
    lastUpdatedDesc: "Last report update",
    mostStartups: "Most startups",
    mostInvestors: "Most investors",
    navDesc: "Highest NAV",
    moicDesc: "Highest MOIC",
    vintageDesc: "Newest vintage",
    burnDesc: "Highest burn",
    investmentYearDesc: "Latest investment year",
    overdueDesc: "Most overdue",
  },
  access: {
    subtitle: "Who can access each company and investor organization, plus invites that haven't been used yet.",
    viewOnlyNote: "View only — only Falak Admins can revoke access or cancel invites.",
    pendingRequestsTitle: "Pending Sign-Up Requests",
    noPendingRequests: "No pending requests.",
    requestedLabel: "Requested",
    organizationRequestedLabel: "Organization",
    messageLabel: "Message",
    approveAction: "Approve",
    rejectAction: "Reject",
    approveGrantLabel: "Grant role",
    approveOrgLabel: "Investor organization",
    confirmReject: "Reject the access request from {email}?",
    companiesTitle: "Companies",
    investorsTitle: "Investor Organizations",
    noOrgs: "No organizations yet.",
    summaryCounts: "{members} members · {invites} pending invites",
    membersLabel: "Members",
    pendingInvitesLabel: "Pending invites",
    noMembers: "No active members.",
    noInvites: "No pending invites.",
    roles: { ADMIN: "Admin", MEMBER: "Member" },
    joinedLabel: "Joined",
    sentLabel: "Sent",
    expiresLabel: "Expires",
    revokeAction: "Revoke",
    cancelInviteAction: "Cancel invite",
    confirmRevoke: "Revoke access for {email}? They lose access on their next page load.",
    confirmCancelInvite: "Cancel the invite sent to {email}? Its link will stop working.",
  },
} satisfies Dictionary;

export const ar = {
  common: {
    appName: "منصة فلك لإدارة المحفظة",
  },
  nav: {
    portfolioDashboard: "لوحة المحفظة",
    companyList: "قائمة الشركات",
    managePortfolio: "إدارة المحفظة",
    investorDashboard: "لوحة المستثمر",
    vehicleDashboard: "لوحة الأداة الاستثمارية",
    companyReports: "تقارير الشركات",
    startupForm: "شركاتي",
    reviewWorkspace: "مراجعة التقارير واعتمادها",
    access: "إدارة الوصول",
    openMenu: "فتح القائمة",
    back: "رجوع",
    closeMenu: "إغلاق القائمة",
    signOut: "تسجيل الخروج",
  },
  language: {
    ariaSwitchToArabic: "التبديل إلى العربية",
    ariaSwitchToEnglish: "التبديل إلى الإنجليزية",
    buttonLabelAr: "العربية",
    buttonLabelEn: "English",
  },
  theme: {
    ariaSwitchToDark: "التبديل إلى الوضع الداكن",
    ariaSwitchToLight: "التبديل إلى الوضع الفاتح",
  },
  status: {
    draft: { label: "مسودة", description: "لم تقدمها الشركة بعد" },
    submitted: { label: "تم التقديم", description: "بانتظار مراجعة فلك" },
    under_review: { label: "قيد المراجعة", description: "يقوم فريق فلك بمراجعة التقرير" },
    changes_requested: { label: "طُلب إجراء تعديلات", description: "طلب فلك من الشركة إجراء تعديلات" },
    approved: { label: "تمت الموافقة", description: "تمت الموافقة، بانتظار النشر" },
  },
  stages: {
    PreSeed: "مرحلة ما قبل البذرة",
    BridgeToSeed: "تمويل جسري إلى المرحلة البذرية",
    Seed: "المرحلة البذرية",
    PreSeriesA: "ما قبل السلسلة أ",
    BridgeToSeriesA: "تمويل جسري إلى السلسلة أ",
    SeriesA: "السلسلة أ",
    SeriesB: "السلسلة ب",
    Later: "مرحلة لاحقة",
  },
  customerModels: {
    B2B: "أعمال إلى أعمال",
    B2C: "أعمال إلى مستهلك",
    B2B_B2C: "أعمال إلى أعمال ومستهلكين",
    B2B2C: "أعمال إلى أعمال إلى مستهلك (B2B2C)",
    B2G: "أعمال إلى حكومة (B2G)",
    C2C: "مستهلك إلى مستهلك (C2C)",
    D2C: "مباشر إلى المستهلك (D2C)",
  },
  revenueModels: {
    SaaS: "برمجيات كخدمة (SaaS)",
    Marketplace: "سوق إلكتروني",
    ECommerce: "تجارة إلكترونية",
    TransactionBased: "قائم على المعاملات",
    Subscription: "اشتراك",
    Other: "أخرى",
  },
  currencyNames: {
    SAR: "ريال سعودي (SAR)",
    USD: "دولار أمريكي (USD)",
  },
  vehicleTypes: {
    Fund: "صندوق",
    SPV: "كيان استثماري خاص (SPV)",
  },
  investorTypes: {
    Institutional: "مستثمر مؤسسي",
    FamilyOffice: "مكتب عائلي",
    Individual: "مستثمر فردي",
  },
  departments: {
    VentureBuilder: "بناء المشاريع",
    InvestmentDepartment: "إدارة الاستثمار",
  },
  staffRoleNames: {
    FALAK_ADMIN: "مدير النظام",
    FALAK_MANAGEMENT: "الإدارة",
    FALAK_OPERATIONS: "محترف استثمار",
  },
  valuationTypes: {
    LastRound: "آخر جولة تمويل",
    InternalMark: "تقييم داخلي",
    ThirdPartyMark: "تقييم من طرف ثالث",
    Exit: "خروج",
    WrittenOff: "مشطوب",
  },
  capitalTransactionTypes: {
    CapitalCall: "طلب رأس مال",
    Contribution: "مساهمة",
    Distribution: "توزيع",
    ManagementFee: "رسوم إدارة",
  },
  admin: {
    title: "إدارة فلك — لوحة المحفظة",
    subtitle: "رؤية شاملة على مستوى المؤسسة لجميع شركات المحفظة والأدوات الاستثمارية ودورات التقارير.",
    dashboardPeriodLabel: "فترة التقرير",
    companyListTitle: "قائمة الشركات",
    exportCompaniesLabel: "تصدير إلى Excel",
    exportPortfolioLabel: "تصدير المحفظة إلى Excel",
    companyListSubtitle: "جميع شركات المحفظة، قابلة للتصفية حسب الأداة الاستثمارية والفترة والعملة والحالة.",
    kpi: {
      companiesLabel: "شركات المحفظة",
      vehiclesLabel: "الأدوات الاستثمارية",
      investorsLabel: "المستثمرون",
      completionLabel: "نسبة اكتمال التقارير",
      completionHint: "معتمدة للفترة المحددة",
      overdueLabel: "تقارير متأخرة عن التقديم",
      revenueSectionLabel: "إجمالي الإيرادات المُبلّغ عنها",
      noCrossCurrencyNote: "تُعرض كل عملة على حدة — لا يتم دمجها",
      excludesPrefix: "لا يشمل",
      excludesSuffixSingular: "شركة لم تقدم بيانات لهذه الفترة",
      summaryLabel: "ملخص المحفظة",
    },
    reportingStatusPanel: {
      title: "حالة التقارير",
      lastUpdatedColumn: "آخر تحديث",
      deadlineColumn: "الموعد النهائي",
      neverSubmitted: "لم يتم التقديم بعد",
      daysOverdueSuffix: "يوم تأخير",
      withinDeadline: "ضمن الموعد النهائي",
    },
    alerts: {
      title: "تنبيهات المحفظة",
      noAlerts: "لا توجد تنبيهات مفتوحة في المحفظة.",
      severityHigh: "مرتفعة",
      severityMedium: "متوسطة",
      reportingOverduePrefix: "تجاوز الموعد النهائي للتقرير",
      lowRunwaySingular: "شهر من الاستمرارية",
      lowRunwayPlural: "أشهر من الاستمرارية",
      overduePayables: "مستحقات دفع متأخرة",
      overdueReceivables: "مستحقات قبض متأخرة",
    },
    filters: {
      title: "تصفية قائمة الشركات",
      scopeNote: "تُطبق عوامل التصفية على قائمة الشركات أدناه.",
      searchLabel: "بحث",
      searchPlaceholder: "ابحث عن شركة أو قطاع أو أداة استثمارية",
      clearSearchAriaLabel: "مسح البحث",
      vehicleLabel: "الأداة الاستثمارية",
      periodLabel: "فترة التقرير",
      currencyLabel: "العملة",
      statusLabel: "الحالة",
      investmentYearLabel: "سنة الاستثمار",
      allOption: "الكل",
      resetFilters: "إعادة تعيين عوامل التصفية",
      viewTable: "عرض الجدول",
      viewCards: "عرض البطاقات",
    },
    table: {
      caption: "شركات المحفظة مع حالة التقارير والأداة الاستثمارية وآخر إيرادات مُبلّغ عنها",
      companyColumn: "الشركة",
      sectorColumn: "القطاع",
      customerModelColumn: "نموذج العملاء",
      entryStageColumn: "مرحلة الاستثمار",
      currentStageColumn: "المرحلة الحالية",
      vehicleColumn: "الأداة الاستثمارية",
      revenueColumn: "الإيرادات",
      statusColumn: "الحالة",
      lastUpdatedColumn: "آخر تحديث",
      viewCompanyAction: "عرض التقرير",
      noDataValue: "لا توجد بيانات مُقدَّمة",
      departmentColumn: "القسم",
      investmentYearColumn: "سنة الاستثمار",
      grossMarginColumn: "هامش الربح الإجمالي",
      cashBurnColumn: "الحرق النقدي",
      noVehicleValue: "حيازة مباشرة",
    },
    emptyState: "لا توجد شركات مطابقة لعوامل التصفية المحددة.",
    charts: {
      moreSeriesLabel: "+{count} أخرى",
      otherSliceLabel: "أخرى",
      valuationAxisLabel: "التقييم",
      burnLabel: "الحرق النقدي",
      percentileLabel: "الشريحة المئينية",
      navPanelTitle: "صافي قيمة أصول المحفظة (NAV)",
      companyTrendsCaption: "اتجاه الإيرادات والحرق النقدي لكل شركة، لآخر فترتين",
      revenueGrowthQoqColumn: "نمو الإيرادات (ربع سنوي)",
      burnChangeQoqColumn: "تغير الحرق النقدي (ربع سنوي)",
      runwayColumn: "مدة الاستمرارية",
      noTrendDataMessage: "لا يوجد سجل تقارير بعد ضمن النطاق المحدد.",
      investedCapitalLabel: "رأس المال المستثمر",
      portfolioMoicLabel: "مضاعف رأس المال المجمّع (MOIC)",
      moicNotAvailableLabel: "غير متاح",
      noDataMessage: "لا توجد بيانات مسجلة بعد.",
      currencyToggleLabel: "عملة العرض",
      totalLabel: "الإجمالي",
      byVehicleLabel: "حسب الصندوق",
      byDepartmentLabel: "حسب القسم",
      allOption: "الكل",
      startupCountChartTitle: "عدد الشركات الناشئة في المحفظة",
      investedCapitalChartTitle: "إجمالي رأس المال المستثمر",
      navChartTitle: "صافي قيمة الأصول (NAV)",
      marketCapChartTitle: "القيمة السوقية",
      marketCapByStartupChartTitle: "القيمة السوقية حسب الشركة الناشئة",
      vintageVsInvestmentChartTitle: "سنة تأسيس الصندوق مقابل سنة الاستثمار في الشركة الناشئة",
      reportingStatusChartTitle: "التزام الشركات الناشئة بالتقارير",
      fundsFormedLabel: "الصناديق المؤسسة",
      startupsInvestedLabel: "الشركات الناشئة الممولة",
      submissionViewLabel: "حالة تقديم التقرير",
      auditedViewLabel: "حالة القوائم المدققة",
      submittedLabel: "تم التقديم",
      notSubmittedLabel: "لم يتم التقديم",
      auditedLabel: "تم تقديم القوائم المدققة",
      notAuditedLabel: "لم يتم تقديم القوائم المدققة",
      fundListTitle: "قائمة الصناديق",
      fundNameColumn: "اسم الصندوق",
      navColumn: "صافي قيمة الأصول",
      numberOfInvestorsColumn: "عدد المستثمرين",
      sectorDistributionChartTitle: "التوزيع حسب القطاع",
      vehicleDistributionChartTitle: "التوزيع حسب الصندوق",
      stageDistributionChartTitle: "التوزيع حسب المرحلة",
      investmentYearChartTitle: "الشركات الناشئة الممولة سنوياً",
    },
    manage: {
      sectionTitle: "إدارة المحفظة",
      indexSubtitle: "إنشاء وإدارة الشركات والأدوات الاستثمارية والمستثمرين وقوالب التقارير ودوراتها والدعوات.",
      invitesSectionTitle: "دعوة المستثمرين والشركات",
      vehicleAssignmentTitle: "تعيين شركة لأداة استثمارية",
      investorVehicleAssignmentTitle: "تعيين مستثمر لأداة استثمارية",
      investorVehicleAssignmentsCaption: "المستثمرون المعيّنون حالياً لأداة استثمارية، والذين يستلمون تقارير شركاتها.",
      effectiveFromLabel: "ساري من تاريخ",
      commitmentAmountLabel: "المساهمات (صافي المستثمر)",
      ownershipPctAutoHint: "تُحسب نسبة الملكية تلقائياً: المساهمات ÷ إجمالي رأس المال المستثمر للصندوق.",
      unassignAction: "إلغاء التعيين",
      recordCompanyValuationTitle: "تسجيل تقييم شركة",
      recordVehicleValuationTitle: "تسجيل تقييم أداة استثمارية",
      recordCapitalTransactionTitle: "تسجيل حركة رأس مال",
      amountLabel: "المبلغ",
      transactionDateLabel: "تاريخ الحركة",
      descriptionLabel: "الوصف",
      valuationAmountLabel: "مبلغ التقييم",
      navAmountLabel: "صافي قيمة الأصول",
      valuationTypeLabel: "نوع التقييم",
      asOfDateLabel: "بتاريخ",
      sourceLabel: "المصدر (اختياري)",
      nameEnLabel: "الاسم (إنجليزي)",
      nameArLabel: "الاسم (عربي)",
      slugLabel: "المعرّف المختصر (يُستخدم في الروابط، مثال: my-company)",
      sectorEnLabel: "القطاع (إنجليزي)",
      sectorArLabel: "القطاع (عربي)",
      customerModelLabel: "نموذج العملاء",
      revenueModelsLabel: "نماذج الإيرادات",
      currencyLabel: "العملة",
      entryStageLabel: "مرحلة الاستثمار",
      currentStageLabel: "المرحلة الحالية",
      departmentLabel: "القسم",
      vintageYearLabel: "سنة التأسيس",
      setDepartmentTitle: "تحديد قسم الشركة",
      setVintageYearTitle: "تحديد سنة تأسيس الصندوق",
      typeLabel: "النوع",
      submitLabel: "إنشاء",
      archiveAction: "أرشفة",
      companyLabel: "الشركة",
      companiesLabel: "الشركات",
      vehicleLabel: "الأداة الاستثمارية",
      investedAmountLabel: "المبلغ المستثمر",
      ownershipPctLabel: "نسبة الملكية (مثال: 0.10 لنسبة 10%)",
      ownershipPctOptionalLabel: "نسبة الملكية (اختياري، مثال: 0.10 لنسبة 10%)",
      vehicleDescriptionEnLabel: "الوصف (بالإنجليزية، اختياري)",
      vehicleDescriptionArLabel: "الوصف (بالعربية، اختياري)",
      investorEmailLabel: "البريد الإلكتروني (اختياري)",
      investorPhoneLabel: "رقم الهاتف (اختياري)",
      investorBriefEnLabel: "نبذة (بالإنجليزية، اختياري)",
      investorBriefArLabel: "نبذة (بالعربية، اختياري)",
      signedDateLabel: "تاريخ التوقيع",
      templateLabel: "قالب التقارير",
      periodLabelLabel: "اسم الفترة (مثال: الربع الثالث 2026)",
      periodStartLabel: "بداية الفترة",
      periodEndLabel: "نهاية الفترة",
      deadlineLabel: "الموعد النهائي للتقديم",
      emailLabel: "البريد الإلكتروني",
      roleLabel: "الدور",
      newPasswordLabel: "كلمة المرور الجديدة",
      inviteStaffTitle: "دعوة موظف",
      manageStaffTitle: "إدارة الموظفين",
      staffListCaption: "حسابات موظفي فلك، أدوارهم، وأقسامهم.",
      hasPasswordLabel: "كلمة المرور معيّنة",
      yesLabel: "نعم",
      noLabel: "لا",
      setPasswordAction: "تعيين كلمة المرور",
      revokeAction: "إلغاء الصلاحية",
      addMetricAction: "إضافة مؤشر آخر",
      deleteMetricAction: "حذف المؤشر",
      removeRowAction: "إزالة",
      metricDeletePendingNote: "سيُحذف {name} عند الحفظ. تبقى القيم المبلغ عنها سابقاً في التقارير السابقة.",
      undoAction: "تراجع",
      metricKeyLabel: "معرّف المؤشر (مثال: revenue_b2b)",
      metricKeyOptionalLabel: "معرّف المؤشر (اختياري)",
      metricKeyHint: "اترك المعرّف فارغاً ليُنشأ تلقائياً من التسمية الإنجليزية (\"Revenue B2B\" يصبح revenue_b2b). يُحوَّل أي معرّف تكتبه بالطريقة نفسها. يتم تجاهل الصفوف الفارغة.",
      metricLabelEnLabel: "تسمية المؤشر (إنجليزي)",
      metricLabelArLabel: "تسمية المؤشر (عربي)",
      metricDataTypeLabel: "نوع البيانات",
      selectPlaceholder: "اختر...",
      createCompanyTitle: "شركة جديدة",
      createVehicleTitle: "أداة استثمارية جديدة",
      createInvestorTitle: "مستثمر جديد",
      linkVehicleTitle: "ربط أداة استثمارية بشركة",
      createTemplateTitle: "قالب تقارير جديد",
      createCycleTitle: "دورة تقارير جديدة",
      createInviteTitle: "إرسال دعوة للشركة",
      createInvestorInviteTitle: "إرسال دعوة للمستثمر",
      investorLabel: "المستثمر",
      vehiclesListTitle: "الأدوات الاستثمارية",
      investorsListTitle: "المستثمرون",
      industryLabel: "القطاع",
      industryOtherEnLabel: "القطاع (بالإنجليزية)",
      industryOtherArLabel: "القطاع (بالعربية)",
      founderNameLabel: "اسم المؤسس",
      founderEmailLabel: "البريد الإلكتروني للمؤسس",
      founderPhoneLabel: "هاتف المؤسس",
      hqCityLabel: "مدينة المقر الرئيسي",
      hqCountryLabel: "دولة المقر الرئيسي",
      founderSectionTitle: "المؤسس والمقر الرئيسي",
      headquartersLabel: "المقر الرئيسي",
      founderLabel: "المؤسس",
      sentRequestsTitle: "الطلبات المرسلة",
      sentRequestsHint: "استخدم \"إضافة شركات\" لإرسال نفس القالب والفترة إلى شركات ناشئة أخرى.",
      addCompaniesAction: "إضافة شركات",
      alreadySentLabel: "أُرسل مسبقاً",
      cancelAction: "إلغاء",
      newRequestHint: "اختر الشركات الناشئة والقالب والفترة والموعد النهائي لطلب تقارير جديد.",
      addingToRequestHint: "إضافة شركات ناشئة إلى هذا الطلب. يبقى القالب والفترة والموعد النهائي كما في الطلب الأصلي.",
      companiesListTitle: "الشركات الناشئة",
      editCompanyTitle: "تعديل الشركة الناشئة",
      editVehicleTitle: "تعديل الأداة الاستثمارية",
      editInvestorTitle: "تعديل المستثمر",
      editAction: "تعديل",
      saveChangesLabel: "حفظ التغييرات",
      emailAgainAction: "إرسال البريد مجدداً",
      importStartupsAction: "استيراد من Excel",
      importTitle: "استيراد الشركات الناشئة من Excel",
      importIntro: "أضف عدة شركات ناشئة دفعة واحدة: نزّل القالب، واملأ شركة واحدة في كل صف، ثم ارفعه واضغط «فحص الملف». يُفحص كل صف بنفس قواعد النموذج أدناه، ولا يُضاف شيء حتى تضغط «استيراد».",
      importTemplateAction: "تنزيل القالب",
      importFileLabel: "ملف Excel (.xlsx)",
      importCheckAction: "فحص الملف",
      importRunAction: "استيراد {count} شركة ناشئة",
      importReadyCount: "{ready} من {total} صفاً جاهزة للاستيراد. تُتخطى الصفوف التي بها مشكلات.",
      importDoneMessage: "تم استيراد {count} شركة ناشئة.",
      importSkippedNote: "تم تخطي الصفوف التي بها مشكلات: صحّحها في الملف واستورده مجدداً (تُتخطى الشركات المضافة تلقائياً).",
      importRowColumn: "الصف",
      importStatusColumn: "النتيجة",
      importReadyLabel: "جاهز",
      importAddedLabel: "أُضيفت",
      importCloseAction: "إغلاق",
      allDepartmentsOption: "كلا القسمين",
      requestDetailTitle: "طلب التقرير",
      requestEntryTitle: "إدخال بيانات التقرير",
      requestDetailIntro: "جميع الشركات الناشئة التي أُرسل إليها هذا الطلب، وكل رسالة بريد أُرسلت بشأنه، وحالة كل تقرير. استخدم «إدخال البيانات» عندما تصلك الأرقام بطريقة أخرى (بالبريد أو في اجتماع): تُحفظ في تقرير الشركة تماماً كما لو أن الشركة عبّأت النموذج.",
      requestStartupsCount: "{count} شركة ناشئة · {submitted} مقدّمة",
      startupColumn: "الشركة الناشئة",
      cycleColumn: "دورة التقرير",
      lastEmailedColumn: "آخر بريد",
      neverEmailedValue: "لم يُرسل بريد بعد",
      emailHistoryAction: "{count} رسالة",
      dataColumn: "البيانات المدخلة",
      answeredOfLabel: "{answered} من {total} حقلاً",
      resendAction: "إعادة الإرسال",
      enterDataAction: "إدخال البيانات",
      editDataAction: "تعديل البيانات",
      viewDataAction: "عرض البيانات",
      emailSentLabel: "أُرسلت",
      emailFailedLabel: "فشلت",
      emailAutomaticLabel: "تلقائي",
      emailLogUnavailable: "لا يمكن عرض سجل البريد حالياً.",
      entryIntro: "تُحفظ الأرقام المدخلة هنا في تقرير {startup} لفترة {period}، تماماً كما لو أدخلتها الشركة، وتُسجَّل في سجل التدقيق.",
      entrySaveAction: "حفظ",
      entrySubmitAction: "حفظ وتقديم للمراجعة",
      entrySubmitHint: "يؤدي التقديم إلى نقل التقرير إلى المراجعة، حيث تتم الموافقة عليه ونشره في التقرير الربعي.",
      entrySavedMessage: "تم الحفظ.",
      entrySubmittedMessage: "تم الحفظ والتقديم. وافق عليه وانشره من صفحة المراجعة.",
      entryLockedMessage: "تمت الموافقة على هذا التقرير أو نشره، لذا تُعرض أرقامه للقراءة فقط.",
      goToReviewAction: "فتح المراجعة",
      openStartupPageAction: "صفحة الشركة",
      emailKindRequest: "طلب",
      emailKindInvite: "دعوة المؤسس",
      emailKindReminderUpcoming: "تذكير بالموعد",
      emailKindReminderOverdue: "تذكير بالتأخر",
      editTemplateTitle: "تعديل قالب التقارير",
      templatesListTitle: "القوالب",
      templateActiveLabel: "نشط (متاح لدورات التقارير الجديدة)",
      templateInactiveLabel: "غير نشط",
      templateInUseNote: "مستخدم في {count} من دورات التقارير. تنطبق التغييرات عليها أيضاً.",
      metricOrderLabel: "الترتيب",
      metricRequiredLabel: "إلزامي",
      metricActiveLabel: "يظهر في النموذج",
      metricLockedNote: "المفتاح ونوع البيانات مقفلان لأن الشركات الناشئة أدخلت قيماً لهذا المؤشر.",
      deleteSectionTitle: "حذف",
      deleteCompanyWarning: "يزيل هذه الشركة الناشئة من جميع القوائم ولوحات المعلومات والبوابات، وينهي وصول مستخدميها ويلغي دعواتها المعلقة. يمكن استخدام اسمها لشركة جديدة. يُحتفظ بسجلها في قاعدة البيانات لأغراض التدقيق، ولا يمكن استعادتها من المنصة.",
      deleteVehicleWarning: "يزيل هذه الأداة الاستثمارية من جميع القوائم ولوحات المعلومات والبوابات (تبقى الشركات التي تملكها). يمكن استخدام اسمها مجدداً. يُحتفظ بسجلها في قاعدة البيانات لأغراض التدقيق، ولا يمكن استعادتها من المنصة.",
      deleteInvestorWarning: "يزيل هذا المستثمر من جميع القوائم ولوحات المعلومات، وينهي وصول مستخدميه إلى بوابة المستثمرين، ويلغي دعواته المعلقة ويغلق مراكزه في الأدوات الاستثمارية، فلا يتلقى تقارير أخرى. يُحتفظ بسجله في قاعدة البيانات لأغراض التدقيق، ولا يمكن استعادته من المنصة.",
      deleteConfirmLabel: "للتأكيد، اكتب الاسم بالإنجليزية:",
      deleteAction: "حذف",
      successMessage: "تم الحفظ.",
      inviteCreatedMessage: "تم إنشاء الدعوة. انسخ هذا الرابط وأرسله إلى الشركة بنفسك — إرسال البريد الإلكتروني التلقائي غير مُفعّل بعد.",
      auditLogTitle: "سجل التدقيق",
      auditActorColumn: "المستخدم",
      auditActionColumn: "الإجراء",
      auditTargetColumn: "الهدف",
      auditWhenColumn: "الوقت",
      auditFilterLabel: "الإجراء",
      auditAllActionsOption: "جميع الإجراءات",
      auditNoEventsMessage: "لا توجد أحداث تدقيق.",
      auditPreviousPageAction: "السابق",
      auditNextPageAction: "التالي",
      copyLinkAction: "نسخ الرابط",
      linkCopiedMessage: "تم النسخ.",
    },
  },
  companyReport: {
    profileTitle: "الملف التعريفي للشركة",
    revenueModelsLabel: "نماذج الإيرادات",
    linkedVehiclesTitle: "الأدوات الاستثمارية المرتبطة",
    noVehiclesLinked: "لا توجد أداة استثمارية مرتبطة",
    backToRegister: "العودة إلى تقارير الشركات",
    backToMyCompanies: "العودة إلى شركاتي",
    backToPrefix: "العودة إلى",
    narrativeTitle: "السرد",
    historyTitle: "سجل التقارير",
    noReportingHistory: "لم يتم إنشاء أي دورات تقارير لهذه الشركة بعد.",
    revenueLabel: "الإيرادات",
    revenueGrowthLabel: "نمو الإيرادات",
    revenueGrowthVsPrefix: "مقارنة بـ",
    revenueGrowthNoPriorPeriod: "لا توجد فترة سابقة للمقارنة",
    revenueGrowthInsufficientData: "بيانات إيرادات غير كافية للمقارنة",
    latestValuationLabel: "آخر تقييم",
    valuationAsOfPrefix: "بتاريخ",
    valuationHistoryTitle: "تطور التقييم عبر الزمن",
    quarterlyToggleLabel: "ربع سنوي",
    annuallyToggleLabel: "سنوي",
    metricsTitle: "مؤشرات التشغيل",
    grossMarginLabel: "هامش الربح الإجمالي",
    netMarginLabel: "هامش الربح الصافي",
    naValueDisplay: "غير متاح",
    trendTitle: "اتجاه الإيرادات والحرق النقدي",
    quarterlyRevenueTitle: "الإيرادات الربع سنوية",
    annualActualLabel: "الإيرادات السنوية (فعلية)",
    annualProjectedLabel: "الإيرادات السنوية (متوقعة)",
    projectionMethodNote: "الأرباع المُبلغ عنها حتى تاريخه، مع تكرار آخر ربع لكل ربع متبقٍ.",
    reportedSeriesLabel: "مُبلغ عنها",
    projectedSeriesLabel: "متوقعة",
  },
  quarterlyReport: {
    backToReport: "العودة إلى تقرير الشركة",
    brandSubtitle: "فلك للاستثمار الملائكي · مُقدَّم من فلك فينتشرز",
    reportedPeriodLabel: "الفترة المُقدَّم عنها التقرير",
    publishedLabel: "تاريخ النشر",
    printAction: "طباعة / حفظ كملف PDF",
    currentRevenueLabel: "إيرادات الربع الحالي",
    priorRevenueLabel: "إيرادات الربع السابق",
    projectionLabel: "توقع الإيرادات السنوي",
    projectionHint: "إيرادات الربع الحالي × 4",
    chartTitle: "اتجاه الإيرادات والتوقعات",
    cashRunwayTitle: "النقد ومدة السيولة",
    cashRunwayEmpty: "لم يتم الإبلاغ عن أرقام النقد أو مدة السيولة بعد.",
    cashBalanceSeriesLabel: "الرصيد النقدي",
    comparisonTitle: "المقارنة المالية",
    comparisonCaption: "مقارنة الفترة الحالية بالفترة السابقة لإعداد التقارير",
    metricColumnLabel: "المؤشر",
    currentColumnLabel: "الحالي",
    priorColumnLabel: "السابق",
    qoqGrowthColumnLabel: "النمو ربع السنوي",
    growthIndicatorsTitle: "مؤشرات النمو والكفاءة",
    customerMetricsTitle: "مؤشرات العملاء",
    disclaimerText:
      "الأرقام مُقدَّمة ذاتيًا من الشركة ومُجمَّعة من قِبل فلك فينتشرز لأغراض إعلامية فقط. لا يُشكّل هذا المستند نصيحة استثمارية.",
    viewFormattedReportLabel: "عرض التقرير المنسّق",
    viewLatestReportLabel: "عرض أحدث تقرير",
    burnRateLabel: "معدل الحرق النقدي (شهرياً)",
    runwayLabel: "المدة المتبقية للسيولة",
    monthsUnit: "أشهر",
    cashBalanceHint: "الرصيد النقدي:",
    notPublishedMessage: "التقرير المنسّق غير متاح بعد لهذه الفترة.",
  },
  vehicleReport: {
    backToDirectory: "العودة إلى الأدوات الاستثمارية",
    companiesLabel: "الشركات",
    companiesTableTitle: "الشركات ضمن هذه الأداة الاستثمارية",
    noCompaniesLinked: "لا توجد شركات مرتبطة بهذه الأداة الاستثمارية حالياً.",
    investorsTitle: "المستثمرون",
    noInvestorsLinked: "لا يوجد مستثمر مرتبط حالياً",
    investedCapitalLabel: "رأس المال المستثمر",
    latestValuationLabel: "آخر تقييم",
    latestValuationAsOf: "بتاريخ",
    noValuationRecorded: "لم يُسجَّل أي تقييم بعد",
    capTableTitle: "جدول الملكية",
    capTableCaption: "رأس المال المساهم به لكل مستثمر، وصافي رأس المال المستثمر، ونسبة ملكيته في هذه الأداة.",
    investorColumn: "المستثمر",
    contributedCapitalColumn: "رأس المال المساهم به",
    netInvestedCapitalColumn: "صافي رأس المال المستثمر",
    ownershipColumn: "نسبة الملكية",
    totalRow: "الإجمالي",
    trendsTitle: "اتجاهات أداء الشركات",
  },
  submitReport: {
    formTitle: "نموذج التقرير",
    openFormLinkLabel: "فتح نموذج التقرير",
    backToCompanyReport: "العودة إلى تقرير الشركة",
    lockedMessage: "لا يمكن تعديل هذا التقرير هنا بعد الآن.",
    noActiveCycleMessage: "لا توجد دورة تقارير نشطة لهذه الشركة حالياً.",
    metricsNotConfiguredMessage:
      "لم يتم بعد ربط إدخال بيانات التقرير — فهو يعتمد على قالب التقارير الخاص بفلك، والذي لم يُحدَّد بعد.",
    metricsIncompleteMessage: "هذا التقرير يفتقد إلى معلومات مطلوبة ولا يمكن إرساله بعد.",
    sectionFinancial: "الأداء المالي",
    sectionHealth: "الأداء والسلامة المالية",
    sectionCustomer: "مؤشرات العملاء والنمو",
    sectionQualitative: "الجوانب النوعية",
    saveAction: "حفظ",
    saving: "جارٍ الحفظ...",
    savedMessage: "تم الحفظ.",
    naLabel: "لا ينطبق",
    attachmentsTitle: "المرفقات",
    uploadAction: "رفع ملف",
    uploading: "جارٍ الرفع...",
    noAttachmentsMessage: "لم يتم رفع أي ملفات بعد.",
    auditedFinancialsCheckboxLabel: "هذا الملف هو القوائم المالية المدققة",
    auditedFinancialsBadge: "قوائم مالية مدققة",
    uploadErrorMessage: "اختر ملفًا لرفعه.",
  },
  reviewWorkspace: {
    subtitle: "مراجعة التقارير المُقدَّمة وإدارة حالة اعتمادها.",
    statusActionableOption: "قابلة للإجراء (تم التقديم + قيد المراجعة + معتمدة)",
    searchPlaceholder: "ابحث عن شركة أو قطاع",
    reviewAction: "مراجعة",
    actionPanelTitle: "إجراء المراجعة",
    selectPrompt: "اختر تقريراً من القائمة أدناه لمراجعته.",
    startReviewAction: "بدء المراجعة",
    requestChangesAction: "طلب إجراء تعديلات",
    approveAction: "اعتماد",
    publishAction: "نشر",
    noActionAvailable: "لا يوجد إجراء مراجعة متاح لهذه الحالة.",
    narrativeEnLabel: "الإنجليزية",
    narrativeArLabel: "العربية",
    narrativeKinds: {
      operational_update: "التحديث التشغيلي",
      quarter_highlights: "أبرز أحداث الربع",
      investment_review_notes: "ملاحظات مراجعة الاستثمار",
      management_commentary: "تعليق الإدارة",
    },
    saveCorrectionsAction: "حفظ التصحيحات",
    reportsLogTitle: "سجل التقارير",
    reportsLogCaption: "كل دورة تقرير مطلوبة، لكل شركة وصندوق، مع حالتها الحالية.",
    requestedColumn: "تاريخ الطلب",
    publishedColumn: "النشر",
    notPublishedValue: "لم يُنشر بعد",
    editDeadlineAction: "تعديل الموعد النهائي",
    newDeadlineLabel: "الموعد النهائي الجديد",
    saveDeadlineAction: "حفظ",
    cancelAction: "إلغاء",
    downloadReportAction: "تحميل التقرير",
    resendToInvestorsAction: "إعادة الإرسال للمستثمرين",
    resendPending: "جارٍ الإرسال...",
    resendSuccessMessage: "تم إرسال التقرير إلى المستثمرين.",
    sentCountLabel: "تم الإرسال",
    pendingCountLabel: "قيد الانتظار",
    failedCountLabel: "فشل",
    distributionColumn: "أُرسل للمستثمرين",
  },
  investorDashboard: {
    subtitle: "الأدوات الاستثمارية المرتبطة وتقارير الشركات المنشورة المرئية لمؤسستك الاستثمارية.",
    investorSelectLabel: "المستثمر",
    companiesInScopeLabel: "الشركات",
    vehicleExposureTitle: "الأدوات الاستثمارية المرتبطة",
    visibleCompaniesLabel: "الشركات المرئية لهذه الفترة",
    noStartupsInVehicle: "لا توجد شركات ناشئة مرتبطة بهذه الأداة الاستثمارية بعد.",
    companiesTableTitle: "الشركات",
    companiesTableCaption: "الشركات المرئية لهذا المستثمر للفترة المحددة، المعتمدة فقط",
    noApprovedReports: "لا توجد تقارير منشورة لهذه المؤسسة والفترة بعد.",
    noOrgAccess: "ليس لديك وصول إلى أي مؤسسة استثمارية بعد.",
    investedCapitalLabel: "رأس المال المستثمر",
    latestNewsTitle: "آخر الأخبار",
    noNewsMessage: "لا توجد مستجدات بعد. تظهر الأخبار هنا عندما يتضمن أحدث تقرير لشركة ناشئة ملاحظات مراجعة الاستثمار.",
    sectorDistributionTitle: "توزيع الشركات الناشئة حسب القطاع",
    noSectorDataMessage: "لا توجد شركات ناشئة في أدواتك الاستثمارية بعد.",
    navChartTitle: "صافي قيمة الأصول",
    navSeriesLabel: "صافي قيمة أصولك",
    noNavMessage: "لم يُسجَّل صافي قيمة أصول لأدواتك الاستثمارية بعد.",
    attachmentsLabel: "المرفقات",
    returnsTitle: "العوائد",
    noReturnsMessage: "لا توجد حركات رأس مال مسجلة لهذه المؤسسة بعد.",
    contributedLabel: "المساهمات",
    distributedLabel: "التوزيعات",
    currentValueLabel: "القيمة الحالية",
    moicLabel: "مضاعف رأس المال (MOIC)",
    irrLabel: "معدل العائد الداخلي (IRR)",
    irrNotAvailableLabel: "غير متاح",
  },
  companyRegister: {
    subtitle: "سجل تقارير كل شركة عبر جميع الفترات، قابل للتصفح والتصفية.",
    periodColumnLabel: "الفترة",
    overdueColumnLabel: "التأخير",
    registerCaption: "صف واحد لكل شركة وفترة تقرير، مرتب حسب الفترة مع تقديم الأحدث أولاً.",
    emptyRegisterMessage: "لا توجد سجلات تقارير مطابقة لعوامل التصفية الحالية.",
    searchPlaceholder: "ابحث عن شركة أو قطاع",
  },
  vehicleDirectory: {
    subtitle: "تصفح كل أداة استثمارية لدى فلك وافتح لوحتها.",
    emptyMessage: "لا توجد أدوات استثمارية متاحة حالياً.",
  },
  submitPortal: {
    subtitle: "شركاتك والوضع الحالي لتقرير كل منها.",
    noMembershipsMessage: "لست عضواً في أي شركة بعد. تتم إضافة أعضاء الشركات عبر دعوة.",
    willOpenEditableMessage: "هذا التقرير متاح للتعديل.",
    willOpenLockedMessage: "هذا التقرير مقفل أثناء المراجعة أو بعد الاعتماد.",
  },
  notFound: {
    title: "الصفحة غير موجودة",
    description: "الصفحة التي تبحث عنها غير موجودة أو ربما تم نقلها.",
    backToHome: "العودة إلى الصفحة الرئيسية",
  },
  home: {
    title: "منصة فلك لإدارة المحفظة",
    subtitle: "تقارير المحفظة لفلك وشركات محفظتها ومستثمريها.",
    openAdmin: "فتح نظرة عامة على المحفظة",
    tagline: "التقارير الفصلية والمراجعة ووصول المستثمرين لمحفظة فلك — في مكان واحد.",
    signInHeading: "تسجيل الدخول",
    signUpHeading: "طلب الوصول",
    signUpPrompt: "جديد هنا؟ أرسل طلبًا وستمنحك فلك الوصول بعد الموافقة عليه.",
  },
  signUp: {
    pageTitle: "طلب الوصول",
    emailLabel: "البريد الإلكتروني",
    roleLabel: "أنا...",
    roleOptions: {
      MANAGEMENT: "إدارة فلك",
      INVESTMENT_PROFESSIONAL: "أخصائي استثمار في فلك",
      INVESTOR: "مستثمر",
    },
    organizationLabel: "المؤسسة الاستثمارية",
    organizationHint: "الصندوق أو الأداة الاستثمارية أو الجهة التي تمثلها.",
    messageLabel: "رسالة (اختياري)",
    submitAction: "إرسال الطلب",
    submitting: "جارٍ الإرسال...",
    successMessage: "تم استلام طلبك. ستُرسل لك فلك بريدًا إلكترونيًا عند الموافقة عليه.",
    existingAccountError: "يوجد حساب بالفعل لهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك.",
    alreadyPendingError: "يوجد طلب معلّق بالفعل لهذا البريد الإلكتروني.",
    genericError: "حدث خطأ ما. حاول مرة أخرى بعد قليل.",
  },
  pendingApproval: {
    title: "بانتظار الموافقة",
    description: "لا يزال طلب الوصول الخاص بك قيد المراجعة. ستُرسل لك فلك بريدًا إلكترونيًا عند الموافقة عليه.",
  },
  companyProfile: {
    subtitle: "ملف الشركة الناشئة",
    openProfileAction: "فتح ملف الشركة الناشئة",
    editDetailsAction: "تعديل البيانات",
    archivedNote: "هذه الشركة الناشئة مؤرشفة.",
    tabOverview: "نظرة عامة",
    tabReports: "التقارير",
    tabDashboard: "لوحة المعلومات",
    statReports: "التقارير المقدمة",
    statReportsValue: "{submitted} من {total}",
    statLatestRevenue: "آخر إيرادات مُبلغ عنها",
    statTotalInvested: "إجمالي الاستثمار",
    statLatestValuation: "آخر تقييم",
    investmentsTitle: "الاستثمارات",
    noInvestments: "لا توجد استثمارات مسجلة بعد.",
    signedColumn: "تاريخ التوقيع",
    amountColumn: "المبلغ المستثمر",
    ownershipColumn: "نسبة الملكية",
    reportsTitle: "جميع التقارير",
    noReports: "لم يُطلب أي تقرير من هذه الشركة الناشئة بعد.",
    templateColumn: "القالب",
    viewOnDashboardAction: "عرض لوحة المعلومات",
    formattedReportAction: "التقرير المنسق",
    correctAction: "تصحيح",
    removeAction: "إزالة",
    removeConfirm: "إزالة هذا الاستثمار؟ لن يُحتسب بعد الآن في أي إجمالي، ويبقى السجل في سجل التدقيق.",
    correctionNote: "يستبدل الحفظ هذا السجل بالسجل المصحح، ويبقى الأصل في سجل التدقيق.",
  },
  lists: {
    searchPlaceholder: "بحث…",
    clearSearch: "مسح البحث",
    sortLabel: "ترتيب",
    noMatches: "لا توجد نتائج مطابقة لبحثك.",
    showingCount: "عرض {shown} من {total}",
    recentlyUpdated: "المضاف أو المعدّل مؤخراً",
    oldestFirst: "الأقدم أولاً",
    newestFirst: "الأحدث أولاً",
    nameAsc: "الاسم (أ–ي)",
    nameDesc: "الاسم (ي–أ)",
    amountDesc: "الأعلى مبلغاً",
    amountAsc: "الأقل مبلغاً",
    periodDesc: "أحدث فترة",
    periodAsc: "أقدم فترة",
    deadlineAsc: "الموعد النهائي (الأقرب)",
    emailAsc: "البريد الإلكتروني (أ–ي)",
    roleAsc: "الدور",
    ownershipDesc: "الأعلى ملكية",
    revenueDesc: "الأعلى إيرادات",
    growthDesc: "الأعلى نمواً",
    runwayAsc: "أقصر مدة سيولة",
    statusAsc: "الحالة",
    sectorAsc: "القطاع (أ–ي)",
    stageAsc: "المرحلة",
    lastUpdatedDesc: "آخر تحديث للتقرير",
    mostStartups: "الأكثر شركات ناشئة",
    mostInvestors: "الأكثر مستثمرين",
    navDesc: "الأعلى صافي قيمة أصول",
    moicDesc: "الأعلى مضاعف رأس المال",
    vintageDesc: "أحدث سنة تأسيس",
    burnDesc: "الأعلى حرقاً للنقد",
    investmentYearDesc: "أحدث سنة استثمار",
    overdueDesc: "الأكثر تأخراً",
  },
  access: {
    subtitle: "من يمكنه الوصول إلى كل شركة ومؤسسة استثمارية، إضافة إلى الدعوات التي لم تُستخدم بعد.",
    viewOnlyNote: "للعرض فقط — يمكن لمسؤولي فلك فقط إلغاء الوصول أو إلغاء الدعوات.",
    pendingRequestsTitle: "طلبات التسجيل المعلّقة",
    noPendingRequests: "لا توجد طلبات معلّقة.",
    requestedLabel: "الطلب",
    organizationRequestedLabel: "المؤسسة",
    messageLabel: "الرسالة",
    approveAction: "موافقة",
    rejectAction: "رفض",
    approveGrantLabel: "منح الدور",
    approveOrgLabel: "المؤسسة الاستثمارية",
    confirmReject: "رفض طلب الوصول من {email}؟",
    companiesTitle: "الشركات",
    investorsTitle: "المؤسسات الاستثمارية",
    noOrgs: "لا توجد مؤسسات بعد.",
    summaryCounts: "{members} أعضاء · {invites} دعوات معلّقة",
    membersLabel: "الأعضاء",
    pendingInvitesLabel: "الدعوات المعلّقة",
    noMembers: "لا يوجد أعضاء نشطون.",
    noInvites: "لا توجد دعوات معلّقة.",
    roles: { ADMIN: "مسؤول", MEMBER: "عضو" },
    joinedLabel: "انضم في",
    sentLabel: "أُرسلت في",
    expiresLabel: "تنتهي في",
    revokeAction: "إلغاء الوصول",
    cancelInviteAction: "إلغاء الدعوة",
    confirmRevoke: "إلغاء وصول {email}؟ سيفقد الوصول عند تحميل الصفحة التالية.",
    confirmCancelInvite: "إلغاء الدعوة المرسلة إلى {email}؟ سيتوقف رابطها عن العمل.",
  },
} satisfies Dictionary;
