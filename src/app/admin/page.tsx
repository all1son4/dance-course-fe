"use client";

import { type FormEvent, useState } from "react";

import { AdminFeatureHeader, AdminLogin, AdminSidebar } from "./components/admin-shell";
import { BroadcastWorkspace } from "./components/broadcast-workspace";
import {
  InviteLinkGeneratorCard,
  InviteLinkJournalCard,
} from "./components/invite-links-workspace";
import {
  ActiveOnlineGroupCard,
  OnlineGroupInviteLinksCard,
  RenewalCampaignsCard,
  RenewalGeneratorCard,
} from "./components/online-group-workspace";
import { OperationsWorkspace } from "./components/operations-workspace";
import { PurchasesWorkspace } from "./components/purchases-workspace";
import { SalesWorkspace } from "./components/sales-workspace";
import { useAdminAuth } from "./hooks/use-admin-auth";
import { useBroadcastAdmin } from "./hooks/use-broadcast-admin";
import { useCopyLink } from "./hooks/use-copy-link";
import { useInviteLinksAdmin } from "./hooks/use-invite-links-admin";
import { useOnlineGroupAdmin } from "./hooks/use-online-group-admin";
import { useOperationsAdmin } from "./hooks/use-operations-admin";
import { usePurchasesAdmin } from "./hooks/use-purchases-admin";
import { useSalesAdmin } from "./hooks/use-sales-admin";
import { ADMIN_FEATURES } from "./lib/admin.constants";
import type { AdminFeatureId } from "./lib/admin.types";
import {
  AdminInvitePage,
  AdminShell,
  Card,
  MainPanel,
  OnlineGroupWorkspace,
  StatusText,
  WorkspaceGrid,
  WorkspacePrimary,
  WorkspaceSecondary,
} from "./page.styles";

export default function AdminPage() {
  const [activeFeatureId, setActiveFeatureId] = useState<AdminFeatureId>("invite-links");

  const activeFeature =
    ADMIN_FEATURES.find((feature) => feature.id === activeFeatureId) ?? ADMIN_FEATURES[0];
  const isInviteLinksFeatureActive = activeFeature.id === "invite-links";
  const isOnlineGroupFeatureActive = activeFeature.id === "online-group";
  const isBroadcastsFeatureActive = activeFeature.id === "broadcasts";
  const isOperationsFeatureActive = activeFeature.id === "operations";
  const isPurchasesFeatureActive = activeFeature.id === "purchases";
  const isSalesFeatureActive = activeFeature.id === "sales";

  const {
    authPassword,
    authStatus,
    handleSessionExpired,
    isAuthorized,
    isChecking,
    isLoggingOut,
    isRefreshingSession,
    isUnlocking,
    logout,
    refreshSession,
    setAuthPassword,
    submitUnlock,
  } = useAdminAuth();

  const inviteLinksAdmin = useInviteLinksAdmin({
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const onlineGroupAdmin = useOnlineGroupAdmin({
    isActive: isOnlineGroupFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const {
    audience: firstTouchBroadcastAudience,
    confirmingGlobalLeadId: confirmingGlobalBroadcastLeadId,
    exclude: handleExcludeFirstTouchBroadcastLead,
    isDisabled: isFirstTouchBroadcastDisabled,
    isLoading: isLoadingFirstTouchBroadcastStats,
    isSending: isSendingFirstTouchBroadcast,
    load: loadFirstTouchBroadcastStats,
    pendingCount: firstTouchBroadcastPendingCount,
    send: handleSendFirstTouchBroadcast,
    setConfirmingGlobalLeadId: setConfirmingGlobalBroadcastLeadId,
    stats: firstTouchBroadcastStats,
    status: firstTouchBroadcastStatus,
    updatingLeadId: updatingFirstTouchBroadcastLeadId,
  } = useBroadcastAdmin({
    isActive: isBroadcastsFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const purchasesAdmin = usePurchasesAdmin({
    isActive: isPurchasesFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const operationsAdmin = useOperationsAdmin({
    isActive: isOperationsFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const {
    activeCampaignTitle: salesActiveCampaignTitle,
    isLoading: isLoadingSalesState,
    load: loadSalesState,
    products: salesProducts,
    status: salesStatus,
    toggle: handleToggleProductSales,
    updatingProductId: updatingSalesProductId,
  } = useSalesAdmin({
    isActive: isSalesFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });

  const handleRefreshSession = () =>
    refreshSession({ after: inviteLinksAdmin.loadJournal });

  const handleLogout = () => logout({ onLoggedOut: inviteLinksAdmin.resetForLogout });

  const handleGenerateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void inviteLinksAdmin.generate();
  };

  const handleOnlineGroupAdminAccessSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onlineGroupAdmin.generateAdminAccess();
  };

  const handleRenewalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onlineGroupAdmin.generateRenewal();
  };

  const handleSaveOnlineGroupSettingsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onlineGroupAdmin.saveSettings();
  };

  const { copyingUrl, copyLink: handleCopyLink } = useCopyLink({
    onStatus: inviteLinksAdmin.setStatus,
  });

  if (!isAuthorized) {
    return (
      <AdminLogin
        authPassword={authPassword}
        authStatus={authStatus}
        isChecking={isChecking}
        isUnlocking={isUnlocking}
        onPasswordChange={setAuthPassword}
        onSubmit={submitUnlock}
      />
    );
  }

  return (
    <AdminInvitePage>
      <AdminShell>
        <AdminSidebar
          activeFeatureId={activeFeature.id}
          isLoggingOut={isLoggingOut}
          isRefreshingSession={isRefreshingSession}
          onFeatureSelect={setActiveFeatureId}
          onLogout={handleLogout}
          onRefreshSession={handleRefreshSession}
        />

        <Card>
          <MainPanel>
            <AdminFeatureHeader feature={activeFeature} />

            {authStatus && (
              <StatusText $tone={authStatus.tone}>{authStatus.text}</StatusText>
            )}

            {isSalesFeatureActive ? (
              <SalesWorkspace
                activeCampaignTitle={salesActiveCampaignTitle}
                isLoading={isLoadingSalesState}
                onRefresh={loadSalesState}
                onToggle={handleToggleProductSales}
                products={salesProducts}
                status={salesStatus}
                updatingProductId={updatingSalesProductId}
              />
            ) : isOnlineGroupFeatureActive ? (
              <OnlineGroupWorkspace>
                <ActiveOnlineGroupCard
                  activeCampaign={onlineGroupAdmin.activeCampaign}
                  activeMainChatTitle={onlineGroupAdmin.activeMainChatTitle}
                  inspirationChatTitle={onlineGroupAdmin.inspirationChatTitle}
                  isFormOpen={onlineGroupAdmin.isFormOpen}
                  isLoading={onlineGroupAdmin.isLoading}
                  isSaveDisabled={onlineGroupAdmin.isSaveDisabled}
                  isSaving={onlineGroupAdmin.isSaving}
                  libraryChatId={onlineGroupAdmin.libraryChatId}
                  mainChatId={onlineGroupAdmin.mainChatId}
                  onFormToggle={onlineGroupAdmin.toggleForm}
                  onLibraryChatChange={onlineGroupAdmin.changeLibraryChat}
                  onMainChatChange={onlineGroupAdmin.changeMainChat}
                  onRefresh={onlineGroupAdmin.load}
                  onStartsAtChange={onlineGroupAdmin.changeStartsAt}
                  onSubmit={handleSaveOnlineGroupSettingsSubmit}
                  onTitleChange={onlineGroupAdmin.setTitle}
                  startsAt={onlineGroupAdmin.startsAt}
                  status={onlineGroupAdmin.status}
                  telegramChatOptions={onlineGroupAdmin.telegramChatSelectOptions}
                  title={onlineGroupAdmin.title}
                />
                {onlineGroupAdmin.hasConfiguredCampaign && (
                  <OnlineGroupInviteLinksCard
                    accessMode={onlineGroupAdmin.adminAccessMode}
                    adminLabel={onlineGroupAdmin.adminLabel}
                    copyingUrl={copyingUrl}
                    grants={onlineGroupAdmin.adminGrants}
                    isDisabled={onlineGroupAdmin.isAdminGenerateDisabled}
                    isGenerating={onlineGroupAdmin.isGeneratingAdminAccess}
                    isLoading={onlineGroupAdmin.isLoading}
                    onAccessModeChange={onlineGroupAdmin.changeAdminAccessMode}
                    onAdminLabelChange={onlineGroupAdmin.changeAdminLabel}
                    onCopy={handleCopyLink}
                    onRefresh={onlineGroupAdmin.load}
                    onSubmit={handleOnlineGroupAdminAccessSubmit}
                    status={onlineGroupAdmin.adminStatus}
                  />
                )}
                {onlineGroupAdmin.activeCampaign && (
                  <RenewalGeneratorCard
                    chats={onlineGroupAdmin.telegramChats}
                    copyingUrl={copyingUrl}
                    generatedLink={onlineGroupAdmin.generatedRenewalLink}
                    isDisabled={onlineGroupAdmin.isRenewalGenerateDisabled}
                    isGenerating={onlineGroupAdmin.isGeneratingRenewal}
                    isLoading={onlineGroupAdmin.isLoading}
                    offerId={onlineGroupAdmin.renewalOfferId}
                    offerOptions={onlineGroupAdmin.renewalOfferSelectOptions}
                    onCopy={handleCopyLink}
                    onOfferChange={onlineGroupAdmin.changeRenewalOffer}
                    onRegenerate={() => void onlineGroupAdmin.generateRenewal(true)}
                    onSourceChatToggle={onlineGroupAdmin.toggleRenewalSourceChat}
                    onSubmit={handleRenewalSubmit}
                    sourceChatIds={onlineGroupAdmin.renewalSourceChatIds}
                    status={onlineGroupAdmin.renewalStatus}
                    title={onlineGroupAdmin.renewalTitle}
                    onTitleChange={onlineGroupAdmin.setRenewalTitle}
                  />
                )}
                {(onlineGroupAdmin.activeCampaign ||
                  onlineGroupAdmin.renewalCampaigns.length > 0) && (
                  <RenewalCampaignsCard
                    campaigns={onlineGroupAdmin.renewalCampaigns}
                    copyingUrl={copyingUrl}
                    onCopy={handleCopyLink}
                    onToggleStatus={onlineGroupAdmin.toggleRenewalStatus}
                    updatingSlug={onlineGroupAdmin.updatingRenewalSlug}
                  />
                )}
              </OnlineGroupWorkspace>
            ) : isInviteLinksFeatureActive ? (
              <WorkspaceGrid>
                <WorkspacePrimary>
                  <InviteLinkGeneratorCard
                    adminLabel={inviteLinksAdmin.adminLabel}
                    choreoSelectOptions={inviteLinksAdmin.choreoSelectOptions}
                    copyingUrl={copyingUrl}
                    generatedLink={inviteLinksAdmin.generatedLink}
                    generatorStatus={inviteLinksAdmin.status}
                    isGenerateDisabled={inviteLinksAdmin.isGenerateDisabled}
                    isGenerating={inviteLinksAdmin.isGenerating}
                    kind={inviteLinksAdmin.kind}
                    kindSelectOptions={inviteLinksAdmin.kindSelectOptions}
                    onAdminLabelChange={inviteLinksAdmin.setAdminLabel}
                    onChoreoSelectionChange={inviteLinksAdmin.selectChoreo}
                    onCopy={handleCopyLink}
                    onKindChange={inviteLinksAdmin.changeKind}
                    onSubmit={handleGenerateSubmit}
                    selectedChoreoKey={inviteLinksAdmin.selectedChoreoKey}
                  />
                </WorkspacePrimary>

                <WorkspaceSecondary>
                  <InviteLinkJournalCard
                    copyingUrl={copyingUrl}
                    isInitialLoading={inviteLinksAdmin.isJournalInitialLoading}
                    isLoading={inviteLinksAdmin.isJournalLoading}
                    links={inviteLinksAdmin.recentLinks}
                    onCopy={handleCopyLink}
                    onRefresh={inviteLinksAdmin.refreshJournal}
                  />
                </WorkspaceSecondary>
              </WorkspaceGrid>
            ) : isBroadcastsFeatureActive ? (
              <BroadcastWorkspace
                audience={firstTouchBroadcastAudience}
                confirmingGlobalLeadId={confirmingGlobalBroadcastLeadId}
                isDisabled={isFirstTouchBroadcastDisabled}
                isLoadingStats={isLoadingFirstTouchBroadcastStats}
                isSending={isSendingFirstTouchBroadcast}
                isUpdatingLeadId={updatingFirstTouchBroadcastLeadId}
                onExclude={handleExcludeFirstTouchBroadcastLead}
                onGlobalExcludeCancel={() => setConfirmingGlobalBroadcastLeadId("")}
                onGlobalExcludeRequest={setConfirmingGlobalBroadcastLeadId}
                onRefresh={loadFirstTouchBroadcastStats}
                onSend={handleSendFirstTouchBroadcast}
                pendingCount={firstTouchBroadcastPendingCount}
                stats={firstTouchBroadcastStats}
                status={firstTouchBroadcastStatus}
              />
            ) : isPurchasesFeatureActive ? (
              <PurchasesWorkspace
                appliedSearch={purchasesAdmin.appliedSearch}
                isDownloadingReport={purchasesAdmin.isDownloadingReport}
                isLoading={purchasesAdmin.isLoading}
                isSendingReport={purchasesAdmin.isSendingReport}
                monthValue={purchasesAdmin.monthValue}
                months={purchasesAdmin.months}
                onClearSearch={purchasesAdmin.clearSearch}
                onDownloadReport={purchasesAdmin.downloadReport}
                onMonthChange={purchasesAdmin.selectMonth}
                onRefresh={purchasesAdmin.refresh}
                onResendEmail={purchasesAdmin.resendEmail}
                onSearchInputChange={purchasesAdmin.setSearchInput}
                onSendReport={purchasesAdmin.sendReport}
                onSubmitSearch={purchasesAdmin.submitSearch}
                previousSummary={purchasesAdmin.previousSummary}
                products={purchasesAdmin.products}
                purchases={purchasesAdmin.purchases}
                reportStatus={purchasesAdmin.reportStatus}
                resendingPaymentIntentId={purchasesAdmin.resendingPaymentIntentId}
                searchInput={purchasesAdmin.searchInput}
                status={purchasesAdmin.status}
                summary={purchasesAdmin.summary}
              />
            ) : isOperationsFeatureActive ? (
              <OperationsWorkspace
                copyingUrl={copyingUrl}
                isLoading={operationsAdmin.isLoading}
                onCopy={handleCopyLink}
                onRefresh={operationsAdmin.refresh}
                onReissueAccess={operationsAdmin.reissueAccess}
                onReplay={operationsAdmin.replay}
                reissuedLinks={operationsAdmin.reissuedLinks}
                reissuingPaymentIntentId={operationsAdmin.reissuingPaymentIntentId}
                replayingKey={operationsAdmin.replayingKey}
                snapshot={operationsAdmin.snapshot}
                status={operationsAdmin.status}
              />
            ) : null}
          </MainPanel>
        </Card>
      </AdminShell>
    </AdminInvitePage>
  );
}
