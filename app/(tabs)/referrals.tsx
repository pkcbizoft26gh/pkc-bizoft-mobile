import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { colors, radii } from '../../constants/theme';

type PayoutMethod = 'GCash' | 'Maya' | 'Bank' | 'Other';

type Client = {
  id: string;
  customer_name: string | null;
  referral_code: string | null;
  user_id: string | null;
};

type Referral = {
  id: string;
  referral_code: string;
  referred_client_id: string | null;
  installation_discount: number | null;
  installation_discount_status: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

type ReferralReward = {
  id: string;
  referral_id: string;
  referrer_client_id: string;
  amount: number;
  status: string;
  eligible_at: string | null;
  withdrawal_id: string | null;
  created_at: string;
};

type ReferralWithdrawal = {
  id: string;
  referrer_client_id: string;
  gross_amount: number;
  transfer_fee: number;
  net_amount: number;
  payout_method: string;
  payout_account_name: string;
  payout_account_number: string;
  payout_notes: string | null;
  status: string;
  accounting_notes: string | null;
  requested_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const TRANSFER_FEE = 5;

const PAYOUT_METHODS: PayoutMethod[] = [
  'GCash',
  'Maya',
  'Bank',
  'Other',
];

export default function ReferralsScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [withdrawals, setWithdrawals] = useState<ReferralWithdrawal[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('GCash');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');

  const loadReferralData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setUserId(null);
        setClient(null);
        setReferrals([]);
        setRewards([]);
        setWithdrawals([]);
        return;
      }

      setUserId(user.id);

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(
          'id, customer_name, referral_code, user_id'
        )
        .eq('user_id', user.id)
        .maybeSingle();

      if (clientError) {
        throw clientError;
      }

      if (!clientData) {
        setClient(null);
        setReferrals([]);
        setRewards([]);
        setWithdrawals([]);
        return;
      }

      setClient(clientData as Client);

      const [
        referralsResult,
        rewardsResult,
        withdrawalsResult,
      ] = await Promise.all([
        supabase
          .from('referrals')
          .select(
            `
              id,
              referral_code,
              referred_client_id,
              installation_discount,
              installation_discount_status,
              status,
              created_at,
              updated_at
            `
          )
          .eq('referrer_client_id', clientData.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('referral_rewards')
          .select(
            `
              id,
              referral_id,
              referrer_client_id,
              amount,
              status,
              eligible_at,
              withdrawal_id,
              created_at
            `
          )
          .eq('referrer_client_id', clientData.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('referral_withdrawals')
          .select(
            `
              id,
              referrer_client_id,
              gross_amount,
              transfer_fee,
              net_amount,
              payout_method,
              payout_account_name,
              payout_account_number,
              payout_notes,
              status,
              accounting_notes,
              requested_at,
              processed_at,
              created_at,
              updated_at
            `
          )
          .eq('referrer_client_id', clientData.id)
          .order('requested_at', { ascending: false }),
      ]);

      if (referralsResult.error) {
        throw referralsResult.error;
      }

      if (rewardsResult.error) {
        /*
         * If the referral_rewards table has not been created yet,
         * the page still loads the referral information instead of
         * completely failing.
         */
        const message = rewardsResult.error.message?.toLowerCase() ?? '';

        if (
          message.includes('relation') &&
          message.includes('referral_rewards')
        ) {
          setRewards([]);
        } else {
          throw rewardsResult.error;
        }
      } else {
        setRewards((rewardsResult.data ?? []) as ReferralReward[]);
      }

      if (withdrawalsResult.error) {
        const message =
          withdrawalsResult.error.message?.toLowerCase() ?? '';

        if (
          message.includes('relation') &&
          message.includes('referral_withdrawals')
        ) {
          setWithdrawals([]);
        } else {
          throw withdrawalsResult.error;
        }
      } else {
        setWithdrawals(
          (withdrawalsResult.data ?? []) as ReferralWithdrawal[]
        );
      }

      setReferrals((referralsResult.data ?? []) as Referral[]);
    } catch (err: any) {
      console.error('Referral loading error:', err);

      setError(
        err?.message ||
          'Unable to load your referral information.'
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadReferralData();
  }, [loadReferralData]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadReferralData(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadReferralData]);

  const referralCode = client?.referral_code?.trim() || '';

  const shareReferral = async () => {
    if (!referralCode) {
      Alert.alert(
        'Referral Code Unavailable',
        'Your referral code has not been assigned yet.'
      );
      return;
    }

    try {
      await Share.share({
        title: 'PKC BIZOFT Referral',
        message:
          `Join PKC BIZOFT using my referral code: ${referralCode}\n\n` +
          `Referral Code: ${referralCode}`,
      });
    } catch (err) {
      console.error('Share referral error:', err);
    }
  };

  const successfulReferralCount = useMemo(() => {
    return referrals.filter((referral) => {
      const status = (referral.status || '').toLowerCase();

      return (
        status === 'successful' ||
        status === 'completed' ||
        status === 'installed' ||
        status === 'qualified' ||
        status === 'success'
      );
    }).length;
  }, [referrals]);

  const pendingReferralCount = useMemo(() => {
    return referrals.filter((referral) => {
      const status = (referral.status || '').toLowerCase();

      return ![
        'successful',
        'completed',
        'installed',
        'qualified',
        'success',
        'rejected',
        'cancelled',
      ].includes(status);
    }).length;
  }, [referrals]);

  const eligibleRewards = useMemo(() => {
    return rewards.filter(
      (reward) =>
        reward.status.toLowerCase() === 'eligible'
    );
  }, [rewards]);

  const reservedRewards = useMemo(() => {
    return rewards.filter(
      (reward) =>
        reward.status.toLowerCase() === 'reserved'
    );
  }, [rewards]);

  const withdrawnRewards = useMemo(() => {
    return rewards.filter(
      (reward) =>
        reward.status.toLowerCase() === 'withdrawn'
    );
  }, [rewards]);

  const availableBalance = useMemo(() => {
    return eligibleRewards.reduce(
      (total, reward) => total + Number(reward.amount || 0),
      0
    );
  }, [eligibleRewards]);

  const reservedBalance = useMemo(() => {
    return reservedRewards.reduce(
      (total, reward) => total + Number(reward.amount || 0),
      0
    );
  }, [reservedRewards]);

  const withdrawnBalance = useMemo(() => {
    return withdrawnRewards.reduce(
      (total, reward) => total + Number(reward.amount || 0),
      0
    );
  }, [withdrawnRewards]);

  const totalEarned = useMemo(() => {
    return rewards.reduce(
      (total, reward) => total + Number(reward.amount || 0),
      0
    );
  }, [rewards]);

  const calculatedNetAmount = useMemo(() => {
    const amount = Number(withdrawAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    return Math.max(0, amount - TRANSFER_FEE);
  }, [withdrawAmount]);

  const resetWithdrawalForm = () => {
    setWithdrawAmount('');
    setPayoutMethod('GCash');
    setAccountName('');
    setAccountNumber('');
    setPayoutNotes('');
  };

  const openWithdrawForm = () => {
    if (availableBalance <= 0) {
      Alert.alert(
        'No Available Balance',
        'There is currently no referral balance available for withdrawal. New rewards will appear here after accounting confirms qualifying referrals.'
      );
      return;
    }

    setWithdrawAmount(String(availableBalance));
    setShowWithdrawForm(true);
  };

  const closeWithdrawForm = () => {
    if (submittingWithdrawal) {
      return;
    }

    setShowWithdrawForm(false);
    resetWithdrawalForm();
  };

  const submitWithdrawal = async () => {
    if (!userId || !client) {
      Alert.alert(
        'Unable to Continue',
        'Your customer account could not be found.'
      );
      return;
    }

    const amount = Number(
      withdrawAmount.replace(/,/g, '').trim()
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(
        'Invalid Amount',
        'Enter a valid withdrawal amount.'
      );
      return;
    }

    if (amount > availableBalance) {
      Alert.alert(
        'Insufficient Balance',
        `Your available referral balance is ₱${availableBalance.toFixed(
          2
        )}.`
      );
      return;
    }

    if (amount <= TRANSFER_FEE) {
      Alert.alert(
        'Amount Too Small',
        `The withdrawal amount must be greater than the ₱${TRANSFER_FEE} transfer fee.`
      );
      return;
    }

    const trimmedAccountName = accountName.trim();
    const trimmedAccountNumber = accountNumber.trim();
    const trimmedNotes = payoutNotes.trim();

    if (!trimmedAccountName) {
      Alert.alert(
        'Account Name Required',
        'Enter the name registered on your GCash, Maya, bank, or other payout account.'
      );
      return;
    }

    if (!trimmedAccountNumber) {
      Alert.alert(
        'Account Number Required',
        'Enter your mobile number or bank/account number.'
      );
      return;
    }

    const netAmount = amount - TRANSFER_FEE;

    Alert.alert(
      'Confirm Withdrawal',
      `Gross amount: ₱${amount.toFixed(
        2
      )}\nTransfer fee: ₱${TRANSFER_FEE.toFixed(
        2
      )}\nNet payout: ₱${netAmount.toFixed(
        2
      )}\n\nPayout method: ${payoutMethod}\nAccount: ${trimmedAccountNumber}\n\nSubmit this withdrawal request to accounting?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              setSubmittingWithdrawal(true);

              /*
               * The mobile app only creates the withdrawal request.
               * Accounting/backend remains responsible for reserving
               * the eligible rewards and processing the actual payout.
               *
               * The database should enforce that:
               * - only eligible rewards can be withdrawn
               * - rewards cannot be withdrawn twice
               * - the withdrawal cannot exceed available balance
               * - the ₱5 fee is applied
               */
              const { error: withdrawalError } = await supabase
                .from('referral_withdrawals')
                .insert({
                  referrer_client_id: client.id,
                  gross_amount: amount,
                  transfer_fee: TRANSFER_FEE,
                  net_amount: netAmount,
                  payout_method: payoutMethod,
                  payout_account_name: trimmedAccountName,
                  payout_account_number: trimmedAccountNumber,
                  payout_notes: trimmedNotes || null,
                  status: 'Pending',
                });

              if (withdrawalError) {
                throw withdrawalError;
              }

              setShowWithdrawForm(false);
              resetWithdrawalForm();

              Alert.alert(
                'Withdrawal Submitted',
                `Your ₱${amount.toFixed(
                  2
                )} referral withdrawal request was submitted to accounting.\n\nNet payout after the ₱${TRANSFER_FEE} transfer fee: ₱${netAmount.toFixed(
                  2
                )}.\n\nThe request will remain pending until accounting processes it.`
              );

              await loadReferralData(false);
            } catch (err: any) {
              console.error(
                'Referral withdrawal error:',
                err
              );

              Alert.alert(
                'Withdrawal Failed',
                err?.message ||
                  'Unable to submit your withdrawal request. Please try again.'
              );
            } finally {
              setSubmittingWithdrawal(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPeso = (amount: number) => {
    return `₱${Number(amount || 0).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  };

  const getStatusTone = (status: string | null) => {
    const normalized = (status || '').toLowerCase();

    if (
      normalized === 'paid' ||
      normalized === 'successful' ||
      normalized === 'completed' ||
      normalized === 'eligible' ||
      normalized === 'success'
    ) {
      return 'success';
    }

    if (
      normalized === 'rejected' ||
      normalized === 'cancelled' ||
      normalized === 'failed'
    ) {
      return 'danger';
    }

    if (
      normalized === 'processing' ||
      normalized === 'reserved'
    ) {
      return 'info';
    }

    return 'warning';
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color={colors.accent}
        />
        <Text style={styles.loadingText}>
          Loading referrals...
        </Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.emptyTitle}>
          Sign in required
        </Text>
        <Text style={styles.emptyText}>
          Please sign in to view your referral account.
        </Text>
      </View>
    );
  }

  if (!client) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>₱</Text>
        </View>

        <Text style={styles.emptyTitle}>
          Referral account not ready
        </Text>

        <Text style={styles.emptyText}>
          No customer account was found for this login. Once
          your customer profile is available, your referral
          information will appear here.
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            REFERRAL PROGRAM
          </Text>

          <Text style={styles.title}>
            Refer & Earn
          </Text>

          <Text style={styles.subtitle}>
            Earn ₱250 for every qualifying customer referral.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Unable to load some referral data
            </Text>

            <Text style={styles.errorText}>
              {error}
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadReferralData()}
            >
              <Text style={styles.retryButtonText}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.codeCard}>
          <View style={styles.codeCardTop}>
            <View>
              <Text style={styles.cardLabel}>
                YOUR REFERRAL CODE
              </Text>

              <Text style={styles.referralCode}>
                {referralCode || 'Not assigned'}
              </Text>
            </View>

            <View style={styles.codeIcon}>
              <Text style={styles.codeIconText}>
                ↗
              </Text>
            </View>
          </View>

          <Text style={styles.codeDescription}>
            Share this code with someone who wants to become
            a PKC BIZOFT customer.
          </Text>

          <TouchableOpacity
            style={[
              styles.shareButton,
              !referralCode &&
                styles.disabledButton,
            ]}
            onPress={shareReferral}
            disabled={!referralCode}
          >
            <Text style={styles.shareButtonText}>
              Share Referral Code
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {referrals.length}
            </Text>
            <Text style={styles.statLabel}>
              Total Referrals
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text
              style={[
                styles.statValue,
                styles.successValue,
              ]}
            >
              {successfulReferralCount}
            </Text>
            <Text style={styles.statLabel}>
              Successful
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text
              style={[
                styles.statValue,
                styles.warningValue,
              ]}
            >
              {pendingReferralCount}
            </Text>
            <Text style={styles.statLabel}>
              Pending
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text
              style={[
                styles.statValue,
                styles.accentValue,
              ]}
            >
              {formatPeso(totalEarned)}
            </Text>
            <Text style={styles.statLabel}>
              Total Earned
            </Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <View>
              <Text style={styles.cardLabel}>
                AVAILABLE REFERRAL BALANCE
              </Text>

              <Text style={styles.balanceAmount}>
                {formatPeso(availableBalance)}
              </Text>
            </View>

            <View style={styles.balanceIcon}>
              <Text style={styles.balanceIconText}>
                ₱
              </Text>
            </View>
          </View>

          <Text style={styles.balanceDescription}>
            You can let your referral rewards accumulate or
            withdraw your available balance whenever you want.
          </Text>

          {reservedBalance > 0 ? (
            <View style={styles.reservedRow}>
              <Text style={styles.reservedLabel}>
                Currently reserved:
              </Text>

              <Text style={styles.reservedValue}>
                {formatPeso(reservedBalance)}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.withdrawButton,
              availableBalance <= 0 &&
                styles.disabledButton,
            ]}
            onPress={openWithdrawForm}
            disabled={availableBalance <= 0}
          >
            <Text style={styles.withdrawButtonText}>
              Withdraw Available Balance
            </Text>
          </TouchableOpacity>

          <Text style={styles.feeNotice}>
            A ₱5 transfer fee is deducted from each withdrawal.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>i</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              How the ₱250 reward works
            </Text>

            <Text style={styles.infoText}>
              Your referral earns ₱250 only after the referred
              first-time customer successfully installs and
              accounting confirms the qualifying installment
              payment.
            </Text>

            <Text style={styles.infoText}>
              Registration by itself does not create a reward.
              Once accounting confirms the qualifying payment,
              the ₱250 becomes part of your available referral
              balance.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>+</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              You can keep referring
            </Text>

            <Text style={styles.infoText}>
              Being referred by someone else does not prevent
              you from referring other customers. You can earn
              additional ₱250 rewards and keep accumulating your
              referral balance.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>%</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Separate monthly bill benefit
            </Text>

            <Text style={styles.infoText}>
              The referral reward is separate from the 0.5%
              monthly bill discount available to qualifying
              referrers when paying their own monthly bill.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Your Referrals
            </Text>

            <Text style={styles.sectionSubtitle}>
              Track customers referred using your code.
            </Text>
          </View>
        </View>

        {referrals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>
              No referrals yet
            </Text>

            <Text style={styles.emptyCardText}>
              Share your referral code to start referring
              customers.
            </Text>
          </View>
        ) : (
          referrals.map((referral) => {
            const statusTone = getStatusTone(
              referral.status
            );

            return (
              <View
                key={referral.id}
                style={styles.referralCard}
              >
                <View style={styles.referralCardHeader}>
                  <View style={styles.referralAvatar}>
                    <Text
                      style={styles.referralAvatarText}
                    >
                      ₱
                    </Text>
                  </View>

                  <View
                    style={styles.referralMain}
                  >
                    <Text style={styles.referralTitle}>
                      Referral
                    </Text>

                    <Text style={styles.referralDate}>
                      {formatDate(
                        referral.created_at
                      )}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      statusTone === 'success' &&
                        styles.statusSuccess,
                      statusTone === 'danger' &&
                        styles.statusDanger,
                      statusTone === 'info' &&
                        styles.statusInfo,
                      statusTone === 'warning' &&
                        styles.statusWarning,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {referral.status ||
                        'Pending'}
                    </Text>
                  </View>
                </View>

                <View style={styles.referralDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Referral Code
                    </Text>

                    <Text style={styles.detailValue}>
                      {referral.referral_code ||
                        referralCode ||
                        '—'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Installation Benefit
                    </Text>

                    <Text style={styles.detailValue}>
                      {referral.installation_discount
                        ? formatPeso(
                            Number(
                              referral.installation_discount
                            )
                          )
                        : '—'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Reward
                    </Text>

                    <Text
                      style={[
                        styles.detailValue,
                        styles.rewardValue,
                      ]}
                    >
                      {statusIsSuccessful(
                        referral.status
                      )
                        ? '₱250 qualifying reward'
                        : 'Pending qualification'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Referral Rewards
            </Text>

            <Text style={styles.sectionSubtitle}>
              Rewards confirmed by accounting.
            </Text>
          </View>
        </View>

        {rewards.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>
              No confirmed rewards yet
            </Text>

            <Text style={styles.emptyCardText}>
              Qualifying ₱250 rewards will appear here after
              accounting confirms the required payment.
            </Text>
          </View>
        ) : (
          rewards.map((reward) => {
            const statusTone = getStatusTone(
              reward.status
            );

            return (
              <View
                key={reward.id}
                style={styles.rewardCard}
              >
                <View>
                  <Text style={styles.rewardAmount}>
                    {formatPeso(
                      Number(reward.amount)
                    )}
                  </Text>

                  <Text style={styles.rewardDate}>
                    {reward.eligible_at
                      ? `Eligible ${formatDate(
                          reward.eligible_at
                        )}`
                      : `Created ${formatDate(
                          reward.created_at
                        )}`}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    statusTone === 'success' &&
                      styles.statusSuccess,
                    statusTone === 'danger' &&
                      styles.statusDanger,
                    statusTone === 'info' &&
                      styles.statusInfo,
                    statusTone === 'warning' &&
                      styles.statusWarning,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {reward.status}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Withdrawal History
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your submitted referral payout requests.
            </Text>
          </View>
        </View>

        {withdrawals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>
              No withdrawals yet
            </Text>

            <Text style={styles.emptyCardText}>
              You can withdraw your accumulated available
              referral balance whenever you choose.
            </Text>
          </View>
        ) : (
          withdrawals.map((withdrawal) => {
            const statusTone = getStatusTone(
              withdrawal.status
            );

            return (
              <View
                key={withdrawal.id}
                style={styles.withdrawalCard}
              >
                <View style={styles.withdrawalTop}>
                  <View>
                    <Text style={styles.withdrawalAmount}>
                      {formatPeso(
                        Number(
                          withdrawal.gross_amount
                        )
                      )}
                    </Text>

                    <Text style={styles.withdrawalDate}>
                      {formatDate(
                        withdrawal.requested_at
                      )}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      statusTone === 'success' &&
                        styles.statusSuccess,
                      statusTone === 'danger' &&
                        styles.statusDanger,
                      statusTone === 'info' &&
                        styles.statusInfo,
                      statusTone === 'warning' &&
                        styles.statusWarning,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {withdrawal.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.withdrawalDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Payout Method
                    </Text>

                    <Text style={styles.detailValue}>
                      {withdrawal.payout_method}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Transfer Fee
                    </Text>

                    <Text style={styles.detailValue}>
                      {formatPeso(
                        Number(
                          withdrawal.transfer_fee
                        )
                      )}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Net Payout
                    </Text>

                    <Text
                      style={[
                        styles.detailValue,
                        styles.netValue,
                      ]}
                    >
                      {formatPeso(
                        Number(
                          withdrawal.net_amount
                        )
                      )}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Account
                    </Text>

                    <Text
                      style={styles.detailValue}
                      numberOfLines={1}
                    >
                      {withdrawal.payout_account_number}
                    </Text>
                  </View>

                  {withdrawal.accounting_notes ? (
                    <View style={styles.accountingNote}>
                      <Text
                        style={
                          styles.accountingNoteLabel
                        }
                      >
                        Accounting Note
                      </Text>

                      <Text
                        style={
                          styles.accountingNoteText
                        }
                      >
                        {withdrawal.accounting_notes}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {withdrawnBalance > 0 ? (
          <View style={styles.footerSummary}>
            <Text style={styles.footerSummaryLabel}>
              Total rewards already assigned to withdrawals
            </Text>

            <Text style={styles.footerSummaryValue}>
              {formatPeso(withdrawnBalance)}
            </Text>
          </View>
        ) : null}

        <View style={styles.accountingNotice}>
          <Text style={styles.accountingNoticeTitle}>
            Payout processing
          </Text>

          <Text style={styles.accountingNoticeText}>
            Withdrawal requests are submitted to accounting.
            The app does not mark payouts as paid. Accounting
            will review, process, and update the withdrawal
            status.
          </Text>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {showWithdrawForm ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalEyebrow}>
                    REFERRAL BALANCE
                  </Text>

                  <Text style={styles.modalTitle}>
                    Withdraw Funds
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeWithdrawForm}
                  disabled={submittingWithdrawal}
                >
                  <Text style={styles.closeButtonText}>
                    ×
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.availableBox}>
                <Text style={styles.availableLabel}>
                  Available
                </Text>

                <Text style={styles.availableAmount}>
                  {formatPeso(availableBalance)}
                </Text>
              </View>

              <Text style={styles.inputLabel}>
                Withdrawal Amount
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.currencyPrefix}>
                  ₱
                </Text>

                <TextInput
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  placeholder="0.00"
                  placeholderTextColor={
                    colors.muted
                  }
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                  editable={!submittingWithdrawal}
                />
              </View>

              <Text style={styles.inputHint}>
                You may withdraw any amount up to your
                available balance.
              </Text>

              <Text style={styles.inputLabel}>
                Payout Method
              </Text>

              <View style={styles.methodRow}>
                {PAYOUT_METHODS.map((method) => {
                  const selected =
                    payoutMethod === method;

                  return (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.methodButton,
                        selected &&
                          styles.methodButtonSelected,
                      ]}
                      onPress={() =>
                        setPayoutMethod(method)
                      }
                      disabled={
                        submittingWithdrawal
                      }
                    >
                      <Text
                        style={[
                          styles.methodButtonText,
                          selected &&
                            styles.methodButtonTextSelected,
                        ]}
                      >
                        {method}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>
                Account Name
              </Text>

              <TextInput
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Name registered on payout account"
                placeholderTextColor={colors.muted}
                style={styles.textInput}
                autoCapitalize="words"
                editable={!submittingWithdrawal}
              />

              <Text style={styles.inputLabel}>
                Mobile / Account Number
              </Text>

              <TextInput
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder={
                  payoutMethod === 'GCash' ||
                  payoutMethod === 'Maya'
                    ? '09XXXXXXXXX'
                    : 'Account number'
                }
                placeholderTextColor={colors.muted}
                style={styles.textInput}
                keyboardType="default"
                editable={!submittingWithdrawal}
              />

              <Text style={styles.inputLabel}>
                Notes (Optional)
              </Text>

              <TextInput
                value={payoutNotes}
                onChangeText={setPayoutNotes}
                placeholder="Optional payout instructions"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  styles.notesInput,
                ]}
                multiline
                textAlignVertical="top"
                editable={!submittingWithdrawal}
              />

              <View style={styles.calculationCard}>
                <View style={styles.calculationRow}>
                  <Text
                    style={styles.calculationLabel}
                  >
                    Gross Withdrawal
                  </Text>

                  <Text
                    style={styles.calculationValue}
                  >
                    {formatPeso(
                      Number(withdrawAmount) || 0
                    )}
                  </Text>
                </View>

                <View style={styles.calculationRow}>
                  <Text
                    style={styles.calculationLabel}
                  >
                    Transfer Fee
                  </Text>

                  <Text
                    style={[
                      styles.calculationValue,
                      styles.feeValue,
                    ]}
                  >
                    -{formatPeso(TRANSFER_FEE)}
                  </Text>
                </View>

                <View
                  style={styles.calculationDivider}
                />

                <View style={styles.calculationRow}>
                  <Text
                    style={styles.netLabel}
                  >
                    Net Payout
                  </Text>

                  <Text style={styles.netAmount}>
                    {formatPeso(
                      calculatedNetAmount
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.modalNotice}>
                <Text style={styles.modalNoticeText}>
                  Your request will be sent to accounting.
                  The payout is not automatically marked as
                  paid.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  submittingWithdrawal &&
                    styles.disabledButton,
                ]}
                onPress={submitWithdrawal}
                disabled={submittingWithdrawal}
              >
                {submittingWithdrawal ? (
                  <ActivityIndicator
                    color={colors.bg}
                  />
                ) : (
                  <Text
                    style={
                      styles.submitButtonText
                    }
                  >
                    Submit Withdrawal Request
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeWithdrawForm}
                disabled={submittingWithdrawal}
              >
                <Text style={styles.cancelButtonText}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function statusIsSuccessful(
  status: string | null
): boolean {
  const normalized = (status || '').toLowerCase();

  return [
    'successful',
    'completed',
    'installed',
    'qualified',
    'success',
  ].includes(normalized);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  loadingScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 14,
  },

  centerScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },

  emptyIconText: {
    color: colors.accent,
    fontSize: 30,
    fontWeight: '800',
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },

  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 420,
  },

  header: {
    marginBottom: 20,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 7,
  },

  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },

  errorBox: {
    backgroundColor: 'rgba(255, 92, 122, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 92, 122, 0.3)',
    borderRadius: radii.md,
    padding: 15,
    marginBottom: 16,
  },

  errorTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 5,
  },

  errorText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },

  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.sm,
    backgroundColor: colors.danger,
  },

  retryButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },

  codeCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
  },

  codeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 7,
  },

  referralCode: {
    color: colors.accent,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 1,
  },

  codeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  codeIconText: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800',
  },

  codeDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },

  shareButton: {
    marginTop: 16,
    height: 46,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },

  shareButtonText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },

  disabledButton: {
    opacity: 0.45,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },

  statCard: {
    flexGrow: 1,
    width: '47%',
    minWidth: 145,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
  },

  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },

  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },

  successValue: {
    color: colors.success,
  },

  warningValue: {
    color: colors.warning,
  },

  accentValue: {
    color: colors.accent,
  },

  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 19,
    marginBottom: 14,
  },

  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  balanceAmount: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  balanceIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },

  balanceIconText: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '900',
  },

  balanceDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
  },

  reservedRow: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  reservedLabel: {
    color: colors.muted,
    fontSize: 12,
  },

  reservedValue: {
    color: colors.info,
    fontSize: 12,
    fontWeight: '800',
  },

  withdrawButton: {
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },

  withdrawButtonText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },

  feeNotice: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 9,
  },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 12,
  },

  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12,
  },

  infoIconText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
  },

  infoText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 7,
  },

  sectionHeader: {
    marginTop: 15,
    marginBottom: 10,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },

  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
  },

  emptyCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },

  emptyCardText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  referralCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 10,
  },

  referralCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  referralAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 11,
  },

  referralAvatarText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '900',
  },

  referralMain: {
    flex: 1,
  },

  referralTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  referralDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.round,
    borderWidth: 1,
  },

  statusSuccess: {
    backgroundColor: 'rgba(54, 224, 161, 0.1)',
    borderColor: 'rgba(54, 224, 161, 0.3)',
  },

  statusDanger: {
    backgroundColor: 'rgba(255, 92, 122, 0.1)',
    borderColor: 'rgba(255, 92, 122, 0.3)',
  },

  statusInfo: {
    backgroundColor: 'rgba(88, 166, 255, 0.1)',
    borderColor: 'rgba(88, 166, 255, 0.3)',
  },

  statusWarning: {
    backgroundColor: 'rgba(255, 200, 87, 0.1)',
    borderColor: 'rgba(255, 200, 87, 0.3)',
  },

  statusText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
  },

  referralDetails: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 11,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
  },

  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    flex: 1,
  },

  detailValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },

  rewardValue: {
    color: colors.success,
  },

  rewardCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  rewardAmount: {
    color: colors.success,
    fontSize: 18,
    fontWeight: '900',
  },

  rewardDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },

  withdrawalCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 10,
  },

  withdrawalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  withdrawalAmount: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },

  withdrawalDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },

  withdrawalDetails: {
    marginTop: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },

  netValue: {
    color: colors.success,
  },

  accountingNote: {
    backgroundColor: colors.input,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 8,
  },

  accountingNoteLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },

  accountingNoteText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 17,
  },

  footerSummary: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  footerSummaryLabel: {
    color: colors.muted,
    fontSize: 11,
    flex: 1,
  },

  footerSummaryValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  accountingNotice: {
    backgroundColor: 'rgba(88, 166, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(88, 166, 255, 0.2)',
    borderRadius: radii.md,
    padding: 14,
    marginTop: 12,
  },

  accountingNoticeTitle: {
    color: colors.info,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 5,
  },

  accountingNoticeText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 18,
  },

  bottomSpacing: {
    height: 20,
  },

  modalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    maxHeight: '94%',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 25,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 17,
  },

  modalEyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 5,
  },

  modalTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeButtonText: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 27,
    fontWeight: '300',
  },

  availableBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 17,
  },

  availableLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 5,
  },

  availableAmount: {
    color: colors.success,
    fontSize: 25,
    fontWeight: '900',
  },

  inputLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 12,
  },

  inputWrapper: {
    height: 50,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    flexDirection: 'row',
    alignItems: 'center',
  },

  currencyPrefix: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '900',
    marginLeft: 14,
  },

  amountInput: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 10,
    height: '100%',
  },

  inputHint: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 5,
  },

  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  methodButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  methodButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.overlay,
  },

  methodButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },

  methodButtonTextSelected: {
    color: colors.accent,
  },

  textInput: {
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 13,
  },

  notesInput: {
    minHeight: 82,
    paddingTop: 12,
  },

  calculationCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 16,
  },

  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },

  calculationLabel: {
    color: colors.muted,
    fontSize: 12,
  },

  calculationValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },

  feeValue: {
    color: colors.danger,
  },

  calculationDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 7,
  },

  netLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  netAmount: {
    color: colors.success,
    fontSize: 17,
    fontWeight: '900',
  },

  modalNotice: {
    backgroundColor: 'rgba(88, 166, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(88, 166, 255, 0.2)',
    borderRadius: radii.sm,
    padding: 11,
    marginTop: 12,
  },

  modalNoticeText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
  },

  submitButton: {
    height: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },

  submitButtonText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },

  cancelButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },

  cancelButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
});