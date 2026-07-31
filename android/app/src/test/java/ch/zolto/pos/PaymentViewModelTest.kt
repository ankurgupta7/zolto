package ch.zolto.pos

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import ch.zolto.pos.data.ApiService
import ch.zolto.pos.data.PosSession
import ch.zolto.pos.data.models.CustomLineItem
import ch.zolto.pos.data.models.CustomLineItemRequest
import ch.zolto.pos.data.models.ManualSaleRequest
import ch.zolto.pos.data.models.ManualSaleResponse
import ch.zolto.pos.data.models.PaymentIntentRequest
import ch.zolto.pos.data.models.PaymentIntentResponse
import ch.zolto.pos.data.models.SaleResponse
import ch.zolto.pos.data.models.TwintIntentRequest
import ch.zolto.pos.data.models.TwintIntentResponse
import ch.zolto.pos.viewmodel.PaymentState
import ch.zolto.pos.viewmodel.PaymentViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class PaymentViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var api: ApiService
    private lateinit var viewModel: PaymentViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        PosSession.showHiddenItems = false
        PosSession.clearCart()
        api = mock()
        viewModel = PaymentViewModel(api)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        PosSession.showHiddenItems = false
        PosSession.clearCart()
    }

    @Test
    fun `initial state is Idle`() {
        assertTrue(viewModel.state.value is PaymentState.Idle)
    }

    @Test
    fun `createPaymentIntent transitions through CreatingIntent to IntentCreated`() = runTest {
        val response = PaymentIntentResponse(
            clientSecret = "pi_secret",
            posOrderId = 42,
            totalRappen = 15000,
        )
        whenever(api.createPaymentIntent(any())).thenReturn(response)

        viewModel.createPaymentIntent(listOf(1, 2))
        assertTrue(viewModel.state.value is PaymentState.CreatingIntent)

        advanceUntilIdle()
        val state = viewModel.state.value
        assertTrue(state is PaymentState.IntentCreated)
        assertEquals("pi_secret", (state as PaymentState.IntentCreated).response.clientSecret)
        assertEquals(42, state.response.posOrderId)
    }

    @Test
    fun `createPaymentIntent transitions to Failed on exception`() = runTest {
        whenever(api.createPaymentIntent(any())).thenThrow(RuntimeException("API error"))

        viewModel.createPaymentIntent(listOf(1))
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is PaymentState.Failed)
        assertTrue((state as PaymentState.Failed).message.contains("API error"))
    }

    @Test
    fun `createPaymentIntent sends allowHidden=false by default`() = runTest {
        val response = PaymentIntentResponse("secret", 1, 5000)
        whenever(api.createPaymentIntent(any())).thenReturn(response)

        viewModel.createPaymentIntent(listOf(1))
        advanceUntilIdle()

        verify(api).createPaymentIntent(
            eq(PaymentIntentRequest(listOf(1), allowHidden = false))
        )
    }

    @Test
    fun `createPaymentIntent sends allowHidden=true when Show Hidden Items is on`() = runTest {
        PosSession.showHiddenItems = true
        val response = PaymentIntentResponse("secret", 1, 5000)
        whenever(api.createPaymentIntent(any())).thenReturn(response)

        viewModel.createPaymentIntent(listOf(1))
        advanceUntilIdle()

        verify(api).createPaymentIntent(
            eq(PaymentIntentRequest(listOf(1), allowHidden = true))
        )
    }

    @Test
    fun `createCashSale transitions through RecordingCashSale to Succeeded`() = runTest {
        val response = ManualSaleResponse(success = true, posOrderId = 55, totalRappen = 9000)
        whenever(api.manualSale(any())).thenReturn(response)

        viewModel.createCashSale(listOf(3))
        assertTrue(viewModel.state.value is PaymentState.RecordingCashSale)

        advanceUntilIdle()
        val state = viewModel.state.value
        assertTrue(state is PaymentState.Succeeded)
        assertEquals(55, (state as PaymentState.Succeeded).posOrderId)
        assertEquals(9000, state.totalRappen)

        // Cash is recorded with the default "cash" method.
        verify(api).manualSale(eq(ManualSaleRequest(listOf(3), "cash")))
    }

    @Test
    fun `createCashSale includes bargained price overrides and custom items from PosSession`() = runTest {
        PosSession.setPriceOverride(3, 2500)
        PosSession.customItems.add(CustomLineItem(name = "Custom repair", priceRappen = 1000))
        val response = ManualSaleResponse(success = true, posOrderId = 55, totalRappen = 3500)
        whenever(api.manualSale(any())).thenReturn(response)

        viewModel.createCashSale(listOf(3))
        advanceUntilIdle()

        verify(api).manualSale(
            eq(
                ManualSaleRequest(
                    listOf(3),
                    "cash",
                    priceOverrides = mapOf("3" to 2500),
                    customItems = listOf(CustomLineItemRequest(name = "Custom repair", priceRappen = 1000)),
                )
            )
        )
    }

    @Test
    fun `createCashSale transitions to Failed on exception`() = runTest {
        whenever(api.manualSale(any())).thenThrow(RuntimeException("network down"))

        viewModel.createCashSale(listOf(4))
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is PaymentState.Failed)
        assertTrue((state as PaymentState.Failed).message.contains("network down"))
    }

    @Test
    fun `startTwint shows the QR then succeeds once polling reports paid`() = runTest {
        whenever(api.twintIntent(any())).thenReturn(
            TwintIntentResponse(
                redirectUrl = "https://hooks.stripe.com/twint/pi_1",
                paymentIntentId = "pi_1",
                posOrderId = 7,
                totalRappen = 9000,
            )
        )
        whenever(api.confirmSale(any())).thenReturn(
            SaleResponse(success = true, posOrderId = 7, alreadyFulfilled = false)
        )

        val states = mutableListOf<PaymentState>()
        viewModel.state.observeForever { states.add(it) }

        viewModel.startTwint(listOf(1))
        advanceUntilIdle()

        // The QR (Stripe redirect URL) is shown before success.
        val qr = states.filterIsInstance<PaymentState.ShowingTwintQr>().firstOrNull()
        assertNotNull(qr)
        assertEquals("https://hooks.stripe.com/twint/pi_1", qr!!.redirectUrl)

        val last = states.last()
        assertTrue(last is PaymentState.Succeeded)
        assertEquals(7, (last as PaymentState.Succeeded).posOrderId)

        verify(api).twintIntent(eq(TwintIntentRequest(listOf(1))))
    }

    @Test
    fun `startTwint sends allowHidden=false by default`() = runTest {
        whenever(api.twintIntent(any())).thenReturn(
            TwintIntentResponse(
                redirectUrl = "https://hooks.stripe.com/twint/pi_1",
                paymentIntentId = "pi_1",
                posOrderId = 7,
                totalRappen = 9000,
            )
        )

        viewModel.startTwint(listOf(1))
        advanceUntilIdle()

        verify(api).twintIntent(
            eq(TwintIntentRequest(listOf(1), allowHidden = false))
        )
    }

    @Test
    fun `startTwint sends allowHidden=true when Show Hidden Items is on`() = runTest {
        PosSession.showHiddenItems = true
        whenever(api.twintIntent(any())).thenReturn(
            TwintIntentResponse(
                redirectUrl = "https://hooks.stripe.com/twint/pi_1",
                paymentIntentId = "pi_1",
                posOrderId = 7,
                totalRappen = 9000,
            )
        )

        viewModel.startTwint(listOf(1))
        advanceUntilIdle()

        verify(api).twintIntent(
            eq(TwintIntentRequest(listOf(1), allowHidden = true))
        )
    }

    @Test
    fun `startTwint includes bargained price overrides and custom items from PosSession`() = runTest {
        PosSession.setPriceOverride(1, 4000)
        PosSession.customItems.add(CustomLineItem(name = "Custom bracelet", priceRappen = 2000))
        whenever(api.twintIntent(any())).thenReturn(
            TwintIntentResponse(
                redirectUrl = "https://hooks.stripe.com/twint/pi_2",
                paymentIntentId = "pi_2",
                posOrderId = 8,
                totalRappen = 6000,
            )
        )

        viewModel.startTwint(listOf(1))
        advanceUntilIdle()

        verify(api).twintIntent(
            eq(
                TwintIntentRequest(
                    listOf(1),
                    priceOverrides = mapOf("1" to 4000),
                    customItems = listOf(CustomLineItemRequest(name = "Custom bracelet", priceRappen = 2000)),
                )
            )
        )
    }

    @Test
    fun `startTwint fails when the intent call throws`() = runTest {
        whenever(api.twintIntent(any())).thenThrow(RuntimeException("stripe down"))

        viewModel.startTwint(listOf(1))
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is PaymentState.Failed)
        assertTrue((state as PaymentState.Failed).message.contains("stripe down"))
    }

    @Test
    fun `startTwint times out to Failed when the customer never confirms`() = runTest {
        whenever(api.twintIntent(any())).thenReturn(
            TwintIntentResponse("https://hooks.stripe.com/x", "pi_2", 8, 4000)
        )
        // Polling always sees "not succeeded yet".
        whenever(api.confirmSale(any())).thenThrow(RuntimeException("409"))

        viewModel.startTwint(listOf(2))
        advanceUntilIdle()

        assertTrue(viewModel.state.value is PaymentState.Failed)
    }

    @Test
    fun `createPaymentIntent includes the bargained price override from PosSession`() = runTest {
        PosSession.setPriceOverride(1, 3500)
        val response = PaymentIntentResponse("secret", 1, 3500)
        whenever(api.createPaymentIntent(any())).thenReturn(response)

        viewModel.createPaymentIntent(listOf(1))
        advanceUntilIdle()

        verify(api).createPaymentIntent(
            eq(PaymentIntentRequest(listOf(1), allowHidden = false, priceOverrides = mapOf("1" to 3500)))
        )
    }

    @Test
    fun `createPaymentIntent includes custom items from PosSession`() = runTest {
        PosSession.customItems.add(CustomLineItem(name = "Custom repair", priceRappen = 1500))
        val response = PaymentIntentResponse("secret", 1, 1500)
        whenever(api.createPaymentIntent(any())).thenReturn(response)

        viewModel.createPaymentIntent(emptyList())
        advanceUntilIdle()

        verify(api).createPaymentIntent(
            eq(
                PaymentIntentRequest(
                    emptyList(),
                    allowHidden = false,
                    customItems = listOf(CustomLineItemRequest(name = "Custom repair", priceRappen = 1500)),
                )
            )
        )
    }

    @Test
    fun `onCollectingPayment sets CollectingPayment state`() {
        viewModel.onCollectingPayment()
        assertTrue(viewModel.state.value is PaymentState.CollectingPayment)
    }

    @Test
    fun `onProcessingPayment sets ProcessingPayment state`() {
        viewModel.onProcessingPayment()
        assertTrue(viewModel.state.value is PaymentState.ProcessingPayment)
    }

    @Test
    fun `onPaymentSucceeded sets Succeeded state with order info`() = runTest {
        whenever(api.confirmSale(any())).thenReturn(
            SaleResponse(success = true, posOrderId = 10, alreadyFulfilled = false)
        )

        viewModel.onPaymentSucceeded("pi_test_123", 10, 15000)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is PaymentState.Succeeded)
        assertEquals(10, (state as PaymentState.Succeeded).posOrderId)
        assertEquals(15000, state.totalRappen)
    }

    @Test
    fun `onPaymentSucceeded still succeeds even if confirmSale throws`() = runTest {
        whenever(api.confirmSale(any())).thenThrow(RuntimeException("network"))

        viewModel.onPaymentSucceeded("pi_test", 5, 8000)
        advanceUntilIdle()

        // Should still be Succeeded because webhook handles fulfillment
        val state = viewModel.state.value
        assertTrue(state is PaymentState.Succeeded)
    }

    @Test
    fun `onPaymentFailed sets Failed state`() {
        viewModel.onPaymentFailed("Card declined")
        val state = viewModel.state.value
        assertTrue(state is PaymentState.Failed)
        assertEquals("Card declined", (state as PaymentState.Failed).message)
    }

    @Test
    fun `onCancelled sets Cancelled state`() {
        viewModel.onCancelled()
        assertTrue(viewModel.state.value is PaymentState.Cancelled)
    }

    @Test
    fun `reset returns to Idle state`() {
        viewModel.onPaymentFailed("error")
        viewModel.reset()
        assertTrue(viewModel.state.value is PaymentState.Idle)
    }

    // ─── TWINT QR sticker ────────────────────────────────────────────────────
    // The merchant's own sticker rail. TWINT gives us no API, so nothing is
    // polled and nothing is created server-side until the merchant confirms
    // they watched the payment arrive in their own TWINT app.

    @Test
    fun `showTwintSticker puts the code and amount on screen without calling the API`() = runTest {
        viewModel.showTwintSticker("https://cdn.test/qr.png", 4700)

        val state = viewModel.state.value
        assertTrue(state is PaymentState.ShowingTwintSticker)
        assertEquals("https://cdn.test/qr.png", (state as PaymentState.ShowingTwintSticker).qrUrl)
        assertEquals(4700, state.totalRappen)

        // Crucially: no sale exists yet. Showing a QR is not a payment.
        advanceUntilIdle()
        verifyNoInteractions(api)
    }

    @Test
    fun `confirmTwintQr records an attested sale as twint_qr, not twint`() = runTest {
        val response = ManualSaleResponse(success = true, posOrderId = 77, totalRappen = 4700)
        whenever(api.manualSale(any())).thenReturn(response)

        viewModel.confirmTwintQr(listOf(9))
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is PaymentState.Succeeded)
        assertEquals(77, (state as PaymentState.Succeeded).posOrderId)

        // "twint" would claim a Stripe PaymentIntent succeeded. It didn't —
        // this is the merchant's word, same evidentiary grade as cash.
        verify(api).manualSale(eq(ManualSaleRequest(listOf(9), "twint_qr")))
    }

    @Test
    fun `confirmTwintQr carries bargained overrides and custom items`() = runTest {
        PosSession.setPriceOverride(9, 2500)
        PosSession.customItems.add(CustomLineItem(name = "Gift wrap", priceRappen = 500))
        whenever(api.manualSale(any())).thenReturn(
            ManualSaleResponse(success = true, posOrderId = 78, totalRappen = 3000)
        )

        viewModel.confirmTwintQr(listOf(9))
        advanceUntilIdle()

        verify(api).manualSale(
            eq(
                ManualSaleRequest(
                    listOf(9),
                    "twint_qr",
                    priceOverrides = mapOf("9" to 2500),
                    customItems = listOf(CustomLineItemRequest(name = "Gift wrap", priceRappen = 500)),
                )
            )
        )
    }

    @Test
    fun `confirmTwintQr surfaces a failure instead of recording offline like cash`() = runTest {
        // Cash falls back to offline recording because the money is in the
        // merchant's hand either way. A TWINT payment we failed to record is
        // one we also cannot verify later, so it must fail loudly.
        whenever(api.manualSale(any())).thenThrow(RuntimeException("network down"))

        viewModel.confirmTwintQr(listOf(9))
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is PaymentState.Failed)
        assertEquals("network down", (state as PaymentState.Failed).message)
    }
}
