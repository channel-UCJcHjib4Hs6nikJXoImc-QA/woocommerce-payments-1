/**
 * External dependencies
 */
import config from 'config';
/**
 * Internal dependencies
 */
import { merchantWCP } from '../../../utils';
import { fillCardDetails, setupProductCheckout } from '../../../utils/payments';

const { merchant, shopper } = require( '@woocommerce/e2e-utils' );

let orderId;

describe( 'Disputes > Submit losing dispute', () => {
	beforeAll( async () => {
		await page.goto( config.get( 'url' ), { waitUntil: 'networkidle0' } );

		// Place an order to dispute later
		await setupProductCheckout(
			config.get( 'addresses.customer.billing' )
		);
		const card = config.get( 'cards.disputed-unreceived' );
		await fillCardDetails( page, card );
		await shopper.placeOrder();
		await expect( page ).toMatch( 'Order received' );

		// Get the order ID
		const orderIdField = await page.$(
			'.woocommerce-order-overview__order.order > strong'
		);
		orderId = await orderIdField.evaluate( ( el ) => el.innerText );

		await merchant.login();
		await merchant.goToOrder( orderId );
	} );

	afterAll( async () => {
		await merchant.logout();
	} );

	it( 'should process and confirm a losing dispute', async () => {
		// Pull out and follow the link to avoid working in multiple tabs
		const paymentDetailsLink = await page.$eval(
			'p.order_number > a',
			( anchor ) => anchor.getAttribute( 'href' )
		);

		await merchantWCP.openPaymentDetails( paymentDetailsLink );

		// Verify we have a dispute for this purchase
		await expect( page ).toMatchElement( 'li.woocommerce-timeline-item', {
			text: 'Payment disputed as Product not received.',
		} );
		await expect( page ).toMatchElement(
			'div.woocommerce-timeline-item__body a',
			{
				text: 'View dispute',
			}
		);

		// Get the link to the dispute details
		const disputeDetailsElement = await page.$(
			'[data-testid="view-dispute-button"]'
		);
		const disputeDetailsLink = await page.evaluate(
			( anchor ) => anchor.getAttribute( 'href' ),
			disputeDetailsElement
		);

		// Open the dispute details
		await merchantWCP.openDisputeDetails( disputeDetailsLink );

		// Verify we're on the view dispute page
		await expect( page ).toMatchElement(
			'div.wcpay-dispute-details .header-dispute-overview',
			{
				text: 'Dispute overview',
			}
		);
		await expect( page ).toMatchElement(
			'div.wcpay-dispute-details .components-card .components-card__header',
			{
				text: 'Dispute: Product not received',
			}
		);

		// Accept the dispute
		await merchantWCP.openAcceptDispute();

		// If webhooks are not received, the dispute status won't be updated in the dispute list page resulting in test failure.
		// Workaround - Open dispute details page again and check status.
		await merchantWCP.openDisputeDetails( disputeDetailsLink );
		await expect( page ).toMatchElement(
			'div.wcpay-dispute-details .header-dispute-overview',
			{
				text: 'Dispute overview',
			}
		);

		// Confirm buttons are not present anymore since a dispute has been accepted.
		await expect( page ).not.toMatchElement(
			'div.components-card > .components-card__footer > a',
			{
				text: 'Challenge dispute',
			}
		);
		await expect( page ).not.toMatchElement(
			'div.components-card > .components-card__footer > button',
			{
				text: 'Accept dispute',
			}
		);

		// Confirm dispute status is Lost.
		await page.waitForSelector(
			'div.wcpay-dispute-details .header-dispute-overview span.chip-light'
		);
		await expect( page ).toMatchElement(
			'div.wcpay-dispute-details .header-dispute-overview span.chip-light',
			{
				text: 'Lost',
			}
		);
	} );
} );
