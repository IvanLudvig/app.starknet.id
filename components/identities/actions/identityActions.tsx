import React, { useMemo } from "react";
import { FunctionComponent, useEffect, useState } from "react";
import { useAccount, useContractWrite } from "@starknet-react/core";
import ChangeAddressModal from "./changeAddressModal";
import TransferFormModal from "./transferFormModal";
import SubdomainModal from "./subdomainModal";
import { hexToDecimal } from "../../../utils/feltService";
import ClickableAction from "../../UI/iconsComponents/clickableAction";
import styles from "../../../styles/components/identityMenu.module.css";
import { timestampToReadableDate } from "../../../utils/dateService";
import { utils } from "starknetid.js";
import theme from "../../../styles/theme";
import MainIcon from "../../UI/iconsComponents/icons/mainIcon";
import ChangeIcon from "../../UI/iconsComponents/icons/changeIcon";
import TransferIcon from "../../UI/iconsComponents/icons/transferIcon";
import PlusIcon from "../../UI/iconsComponents/icons/plusIcon";
import TxConfirmationModal from "../../UI/txConfirmationModal";
import UnframedIcon from "../../UI/iconsComponents/icons/unframedIcon";
import SignsIcon from "../../UI/iconsComponents/icons/signsIcon";
import { Call } from "starknet";
import { useRouter } from "next/router";
import autoRenewalCalls from "../../../utils/callData/autoRenewalCalls";
import { useNotificationManager } from "../../../hooks/useNotificationManager";
import { NotificationType, TransactionType } from "../../../utils/constants";
import { posthog } from "posthog-js";
import { Identity } from "../../../utils/apiWrappers/identity";
import identityChangeCalls from "../../../utils/callData/identityChangeCalls";

type IdentityActionsProps = {
  identity?: Identity;
  tokenId: string;
  isIdentityADomain: boolean;
  hideActionsHandler: (state: boolean) => void;
  isOwner: boolean;
};

const IdentityActions: FunctionComponent<IdentityActionsProps> = ({
  identity,
  tokenId,
  isIdentityADomain,
  hideActionsHandler,
  isOwner,
}) => {
  const [isAddressFormOpen, setIsAddressFormOpen] = useState<boolean>(false);
  const [isTransferFormOpen, setIsTransferFormOpen] = useState<boolean>(false);
  const [isSubdomainFormOpen, setIsSubdomainFormOpen] =
    useState<boolean>(false);
  const { address } = useAccount();
  const encodedDomains = utils.encodeDomain(identity?.domain);
  const { addTransaction } = useNotificationManager();
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [viewMoreClicked, setViewMoreClicked] = useState<boolean>(false);
  const router = useRouter();
  // AutoRenewals
  const [isAutoRenewalEnabled, setIsAutoRenewalEnabled] =
    useState<boolean>(false);
  const [allowance, setAllowance] = useState<string>("0");
  const [hasReverseAddressRecord, setHasReverseAddressRecord] =
    useState<boolean>(false);
  const [disableRenewalCalldata, setDisableRenewalCalldata] = useState<Call[]>(
    []
  );
  const { writeAsync: disableRenewal, data: disableRenewalData } =
    useContractWrite({
      calls: disableRenewalCalldata,
    });

  const nextAutoRenew = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (identity?.domainExpiry) {
      if (identity?.domainExpiry + 2592000 < now) {
        return "Next today";
      } else {
        return (
          "Next on " + timestampToReadableDate(identity?.domainExpiry - 2592000)
        );
      }
    }
  }, [identity]);

  // Add all subdomains to the parameters
  const callDataEncodedDomain: (number | string)[] = [encodedDomains.length];
  encodedDomains.forEach((domain) => {
    callDataEncodedDomain.push(domain.toString(10));
  });

  const { writeAsync: setMainId, data: mainDomainData } = useContractWrite({
    calls: identity
      ? identityChangeCalls.setAsMainId(
          identity,
          hasReverseAddressRecord,
          callDataEncodedDomain
        )
      : [],
  });

  useEffect(() => {
    if (!address) return;
    fetch(`${process.env.NEXT_PUBLIC_SERVER_LINK}/addr_has_rev?addr=${address}`)
      .then((response) => response.json())
      .then((reverseAddressData) => {
        setHasReverseAddressRecord(reverseAddressData.has_rev);
      });
  }, [address]);

  useEffect(() => {
    if (!address || !identity?.domain || !isOwner) return;
    fetch(
      `${
        process.env.NEXT_PUBLIC_SERVER_LINK
      }/renewal/get_renewal_data?addr=${hexToDecimal(address)}&domain=${
        identity.domain
      }`
    )
      .then((response) => response.json())
      .then((data) => {
        if (!data.error && data.enabled) {
          setIsAutoRenewalEnabled(true);
          setAllowance(BigInt(data.allowance).toString(10));
        } else {
          setIsAutoRenewalEnabled(false);
        }
      });
  }, [address, tokenId, identity, isOwner]);

  useEffect(() => {
    if (!mainDomainData?.transaction_hash) return;
    addTransaction({
      timestamp: Date.now(),
      subtext: "Set as main id",
      type: NotificationType.TRANSACTION,
      data: {
        type: TransactionType.MAIN_DOMAIN,
        hash: mainDomainData.transaction_hash,
        status: "pending",
      },
    });
    setIsTxModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainDomainData]);

  if (!isIdentityADomain) {
    hideActionsHandler(true);
  } else {
    hideActionsHandler(false);
  }

  useEffect(() => {
    if (isAutoRenewalEnabled) {
      setDisableRenewalCalldata(
        autoRenewalCalls.disableRenewal(callDataEncodedDomain[1].toString())
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowance, isAutoRenewalEnabled]); // We don't add callDataEncodedDomain because it would create an infinite loop

  useEffect(() => {
    if (!disableRenewalData?.transaction_hash) return;
    addTransaction({
      timestamp: Date.now(),
      subtext: `Disabled auto renewal for ${identity?.domain}`,
      type: NotificationType.TRANSACTION,
      data: {
        type: TransactionType.DISABLE_AUTORENEW,
        hash: disableRenewalData.transaction_hash,
        status: "pending",
      },
    });
    setIsTxModalOpen(true);
    posthog?.capture("disable-ar"); // track events for analytics
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableRenewalData]); // We want to execute this effect only once, when the transaction is sent

  return (
    <div className={styles.actionsContainer}>
      <>
        <div className={styles.identityActions}>
          {identity && !isOwner && isIdentityADomain && (
            <>
              <ClickableAction
                title="View on Unframed"
                icon={
                  <UnframedIcon
                    width="30"
                    color={theme.palette.secondary.main}
                  />
                }
                description="Check this identity on Unframed"
                onClick={() =>
                  window.open(
                    `https://unframed.co/item/${process.env.NEXT_PUBLIC_STARKNETID_CONTRACT}/${tokenId}`
                  )
                }
              />
              {/* <ClickableAction
                title="View on Aspect"
                icon={
                  <AspectIcon width="25" color={theme.palette.secondary.main} />
                }
                description="Check this identity on Aspect"
                onClick={() =>
                  window.open(
                    `https://aspect.co/asset/${process.env.NEXT_PUBLIC_STARKNETID_CONTRACT}/${tokenId}`
                  )
                }
              /> */}
            </>
          )}
          {identity && isOwner && (
            <div className={styles.identityActions}>
              {callDataEncodedDomain[0] === 1 && !isAutoRenewalEnabled ? (
                <ClickableAction
                  title="ENABLE SUBSCRIPTION"
                  description={nextAutoRenew}
                  style="primary"
                  icon={<div className={styles.renewalIcon}>ON</div>}
                  onClick={() => router.push("/subscription")}
                />
              ) : null}
              {callDataEncodedDomain[0] === 1 ? (
                <ClickableAction
                  title="RENEW YOUR DOMAIN"
                  style="primary"
                  description={`Will expire on ${timestampToReadableDate(
                    identity?.domainExpiry ?? 0
                  )}`}
                  icon={
                    <ChangeIcon width="25" color={theme.palette.primary.main} />
                  }
                  onClick={() => router.push("/renewal")}
                />
              ) : null}
              {!identity.isMain && (
                <ClickableAction
                  title="Set as main domain"
                  description="Set this identity as your main id"
                  icon={
                    <MainIcon
                      width="23"
                      firstColor={theme.palette.secondary.main}
                      secondColor={theme.palette.secondary.main}
                    />
                  }
                  onClick={() => setMainId()}
                />
              )}
              <ClickableAction
                title="CHANGE DOMAIN TARGET"
                description="Change target address"
                icon={
                  <SignsIcon width="25" color={theme.palette.secondary.main} />
                }
                onClick={() => setIsAddressFormOpen(true)}
              />

              {viewMoreClicked ? (
                <>
                  <ClickableAction
                    title="MOVE YOUR IDENTITY NFT"
                    description="Transfer your identity to another wallet"
                    icon={
                      <TransferIcon
                        width="25"
                        color={theme.palette.secondary.main}
                      />
                    }
                    onClick={() => setIsTransferFormOpen(true)}
                  />
                  <ClickableAction
                    title="CREATE A SUBDOMAIN"
                    description="Create a new subdomain"
                    icon={
                      <PlusIcon
                        width="25"
                        color={theme.palette.secondary.main}
                      />
                    }
                    onClick={() => setIsSubdomainFormOpen(true)}
                  />
                  {callDataEncodedDomain[0] === 1 && isAutoRenewalEnabled ? (
                    <ClickableAction
                      title="DISABLE SUBSCRIPTION"
                      description={nextAutoRenew}
                      icon={<div className={styles.renewalIconOff}>OFF</div>}
                      onClick={() => disableRenewal()}
                    />
                  ) : null}
                  <p
                    onClick={() => setViewMoreClicked(false)}
                    className={styles.viewMore}
                  >
                    View less
                  </p>
                </>
              ) : (
                <p
                  onClick={() => {
                    setViewMoreClicked(true);
                  }}
                  className={styles.viewMore}
                >
                  View more
                </p>
              )}
            </div>
          )}
        </div>
        <ChangeAddressModal
          handleClose={() => setIsAddressFormOpen(false)}
          isModalOpen={isAddressFormOpen}
          callDataEncodedDomain={callDataEncodedDomain}
          identity={identity}
          currentTargetAddress={identity?.targetAddress}
        />
        <TransferFormModal
          identity={identity}
          handleClose={() => setIsTransferFormOpen(false)}
          isModalOpen={isTransferFormOpen}
        />
        <SubdomainModal
          handleClose={() => setIsSubdomainFormOpen(false)}
          isModalOpen={isSubdomainFormOpen}
          callDataEncodedDomain={callDataEncodedDomain}
          domain={identity?.domain}
        />
        <TxConfirmationModal
          txHash={mainDomainData?.transaction_hash}
          isTxModalOpen={isTxModalOpen}
          closeModal={() => setIsTxModalOpen(false)}
          title="Your Transaction is on it's way !"
        />
      </>
    </div>
  );
};

export default IdentityActions;
