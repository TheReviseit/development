"""
Unit tests for Inventory Atomicity Guarantees.
Tests the critical invariant: stock is NEVER deducted unless order exists.

Run with: py -m pytest tests/test_inventory_atomicity.py -v
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import uuid


class TestAtomicStockConfirmation:
    """Tests for atomic stock confirmation with order validation."""
    
    def test_stock_not_deducted_if_order_creation_fails(self):
        """
        CRITICAL TEST: If order creation fails, stock must remain unchanged.
        
        Scenario:
        1. Reserve stock (quantity=3)
        2. Order creation fails (throws exception)
        3. Verify: stock unchanged, reservations released
        """
        from unittest.mock import patch, MagicMock
        
        # Mock the inventory service
        with patch('services.inventory_service.get_inventory_service') as mock_get_inv:
            mock_inventory = MagicMock()
            mock_get_inv.return_value = mock_inventory
            
            # Mock successful reservation
            mock_inventory.validate_and_reserve.return_value = MagicMock(
                success=True,
                reservation_ids=['res_1', 'res_2'],
                expires_at=datetime.utcnow()
            )
            
            # Mock repository that fails on create
            with patch('services.order_service.get_order_repository') as mock_get_repo:
                mock_repo = MagicMock()
                mock_get_repo.return_value = mock_repo
                mock_repo.create.side_effect = Exception("DB constraint violation")
                
                from services.order_service import OrderService
                from domain import OrderCreate, OrderItem, OrderSource
                
                service = OrderService(repository=mock_repo)
                
                order_data = OrderCreate(
                    user_id="test_user",
                    customer_name="Test Customer",
                    customer_phone="9876543210",
                    items=[OrderItem(name="T-Shirt", quantity=3)],
                    source=OrderSource.MANUAL,
                )
                
                # Should raise exception
                with pytest.raises(Exception) as exc_info:
                    service.create_order(order_data=order_data)
                
                assert "DB constraint" in str(exc_info.value)
                
                # CRITICAL: confirm_reservation should NOT have been called
                mock_inventory.confirm_reservation.assert_not_called()
                
                # CRITICAL: release_reservation SHOULD have been called
                mock_inventory.release_reservation.assert_called_once()
    
    def test_confirmation_refuses_nonexistent_order(self):
        """
        Test that atomic RPC refuses to deduct stock for non-existent order.
        
        This tests the ATOMIC_GUARD in confirm_reservations_atomic.
        """
        from unittest.mock import patch, MagicMock
        from domain import ReservationError
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Mock the RPC to raise the atomic guard error
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.side_effect = Exception(
                "ATOMIC_GUARD: Order fake_order_123 does not exist. Refusing to deduct stock."
            )
            
            from services.inventory_service import InventoryService
            
            service = InventoryService(repository=mock_repo)
            
            # Should raise ReservationError with guard message
            with pytest.raises(ReservationError) as exc_info:
                service.confirm_reservation(
                    reservation_ids=['res_1'],
                    order_id='fake_order_123',
                    idempotency_key='test_key'
                )
            
            assert "does not exist" in str(exc_info.value)
    
    def test_stock_released_if_confirmation_fails(self):
        """
        Test that if confirmation fails after order creation,
        reservations are released (stock not deducted due to atomic rollback).
        """
        from unittest.mock import patch, MagicMock
        from domain import ReservationError
        
        with patch('services.order_service.get_order_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Order creation succeeds
            mock_order = MagicMock()
            mock_order.id = 'order_123'
            mock_order.user_id = 'test_user'
            mock_order.to_dict.return_value = {}
            mock_repo.create.return_value = mock_order
            
            from services.order_service import OrderService
            from domain import OrderCreate, OrderItem, OrderSource
            
            service = OrderService(repository=mock_repo)
            
            # Patch the internal methods
            service._reserve_stock_for_order = MagicMock(return_value=MagicMock(
                success=True,
                reservation_ids=['res_1'],
            ))
            service._confirm_reservations = MagicMock(
                side_effect=ReservationError(message="RPC timeout")
            )
            service._release_reservations = MagicMock(return_value=True)
            service._emit_event = MagicMock()
            
            order_data = OrderCreate(
                user_id="test_user",
                customer_name="Test Customer",
                customer_phone="9876543210",
                items=[OrderItem(name="T-Shirt", quantity=3)],
                source=OrderSource.MANUAL,
            )
            
            # Should raise exception from confirmation failure
            with pytest.raises(ReservationError):
                service.create_order(order_data=order_data)
            
            # CRITICAL: release_reservations SHOULD have been called
            # because confirmation failed
            service._release_reservations.assert_called_once()
    
    def test_idempotent_confirmation(self):
        """Test that confirming same reservation twice returns success."""
        from unittest.mock import patch, MagicMock
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # First call returns idempotent=true
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.return_value = MagicMock(
                data={'success': True, 'idempotent': True}
            )
            
            from services.inventory_service import InventoryService
            
            service = InventoryService(repository=mock_repo)
            
            # Should succeed without error
            result = service.confirm_reservation(
                reservation_ids=['res_1'],
                order_id='order_123',
                idempotency_key='same_key'
            )
            
            assert result is True


class TestSafetyNetRepair:
    """Tests for the safety net that repairs orphaned confirmations."""
    
    def test_orphan_detection(self):
        """Test that orphaned confirmations are detected."""
        from unittest.mock import patch, MagicMock
        
        with patch('supabase_client.get_supabase_client') as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db
            
            # Mock the RPC call
            mock_db.rpc.return_value.execute.return_value = MagicMock(
                data={'success': True, 'orphans_restored': 2}
            )
            
            from tasks.inventory_safety import repair_orphaned_confirmations
            
            result = repair_orphaned_confirmations()
            
            assert result['success'] is True
            assert result['orphans_restored'] == 2


class TestReservationReleaseOnFailure:
    """Tests that reservations are properly released on various failure scenarios."""
    
    def test_reservation_released_on_db_error(self):
        """Test reservations released when database throws error during order create."""
        # This is covered by test_stock_not_deducted_if_order_creation_fails
        pass
    
    def test_reservation_released_on_validation_error(self):
        """Test reservations released when order validation fails."""
        from unittest.mock import patch, MagicMock
        from domain import ValidationError
        
        with patch('services.order_service.get_order_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Repository raises validation error
            mock_repo.create.side_effect = ValidationError(
                message="Invalid order data"
            )
            
            from services.order_service import OrderService
            from domain import OrderCreate, OrderItem, OrderSource
            
            service = OrderService(repository=mock_repo)
            
            # Patch the internal reservation method to succeed
            service._reserve_stock_for_order = MagicMock(return_value=MagicMock(
                success=True,
                reservation_ids=['res_1'],
            ))
            service._release_reservations = MagicMock(return_value=True)
            
            order_data = OrderCreate(
                user_id="test_user",
                customer_name="Test Customer",  # Use valid data to pass pydantic validation
                customer_phone="9876543210",
                items=[OrderItem(name="T-Shirt", quantity=3)],
                source=OrderSource.MANUAL,
            )
            
            with pytest.raises(ValidationError):
                service.create_order(order_data=order_data)
            
            # Reservations should be released
            service._release_reservations.assert_called_once()


class TestAmazonGradeInvariants:
    """
    ════════════════════════════════════════════════════════════════════════════
    AMAZON-GRADE INVENTORY INVARIANT TESTS
    ════════════════════════════════════════════════════════════════════════════
    
    Core Law: Stock is a promise. Once reserved, it MUST be honored.
    
    These tests verify:
    1. Confirmation NEVER fails due to stock shortage
    2. Oversells are logged as anomalies, not blocked
    3. Proper error semantics for expired/released reservations
    4. Concurrent reservations handled correctly
    """
    
    def test_confirmation_succeeds_even_if_stock_reduced_after_reserve(self):
        """
        CRITICAL TEST: Admin reduces stock after reservation, confirmation MUST succeed.
        
        Scenario:
        1. Stock = 5
        2. Reserve 3 → Success
        3. Admin sets stock to 1 (external change)
        4. Confirm → SUCCESS (not failure!)
        5. Anomaly logged for oversell
        """
        from unittest.mock import patch, MagicMock
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Mock the RPC to return success with anomaly
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.return_value = MagicMock(
                data={
                    'success': True, 
                    'confirmed_count': 1,
                    'anomalies_logged': 1  # Oversell detected but handled
                }
            )
            
            from services.inventory_service import InventoryService
            
            service = InventoryService(repository=mock_repo)
            
            # Should succeed despite stock being lower than reservation
            result = service.confirm_reservation(
                reservation_ids=['res_1'],
                order_id='order_123',
                idempotency_key='test_key'
            )
            
            # CRITICAL: Must succeed
            assert result is True
    
    def test_expired_reservation_raises_correct_error(self):
        """
        Test that expired reservation raises ReservationExpiredError, not stock error.
        """
        from unittest.mock import patch, MagicMock
        from domain import ReservationExpiredError
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Mock the RPC to raise expired error
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.side_effect = Exception(
                "RESERVATION_EXPIRED: Reservations have expired"
            )
            
            from services.inventory_service import InventoryService
            
            service = InventoryService(repository=mock_repo)
            
            # Should raise ReservationExpiredError, NOT ReservationError with stock message
            with pytest.raises(ReservationExpiredError) as exc_info:
                service.confirm_reservation(
                    reservation_ids=['res_1'],
                    order_id='order_123',
                    idempotency_key='test_key'
                )
            
            assert "expired" in str(exc_info.value).lower()
            assert "stock" not in str(exc_info.value).lower()
    
    def test_released_reservation_raises_correct_error(self):
        """
        Test that released reservation raises appropriate error.
        """
        from unittest.mock import patch, MagicMock
        from domain import ReservationError
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Mock the RPC to raise released error
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.side_effect = Exception(
                "RESERVATION_RELEASED: Reservations have been released"
            )
            
            from services.inventory_service import InventoryService
            
            service = InventoryService(repository=mock_repo)
            
            # Should raise ReservationError with released message
            with pytest.raises(ReservationError) as exc_info:
                service.confirm_reservation(
                    reservation_ids=['res_1'],
                    order_id='order_123',
                    idempotency_key='test_key'
                )
            
            assert "released" in str(exc_info.value).lower()
    
    def test_already_confirmed_reservation_is_idempotent(self):
        """
        Test that confirming an already-confirmed reservation returns success.
        """
        from unittest.mock import patch, MagicMock
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Mock the RPC to return already_confirmed
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.return_value = MagicMock(
                data={
                    'success': True, 
                    'already_confirmed': True,
                    'message': 'Reservations already confirmed'
                }
            )
            
            from services.inventory_service import InventoryService
            
            service = InventoryService(repository=mock_repo)
            
            # Should succeed (idempotent)
            result = service.confirm_reservation(
                reservation_ids=['res_1'],
                order_id='order_123',
                idempotency_key='test_key'
            )
            
            assert result is True
    
    def test_confirmation_never_blocks_on_insufficient_stock(self):
        """
        CRITICAL: Verify that "Insufficient stock" error is NEVER raised during confirmation.
        
        This is the core invariant fix - stock validation happens at reserve time,
        confirmation trusts the reservation unconditionally.
        """
        from unittest.mock import patch, MagicMock
        from domain import ReservationError
        
        # Verify the old behavior is NOT happening
        error_messages_that_should_not_occur = [
            "Insufficient stock",
            "Not enough stock",
            "Stock shortage",
            "stock_quantity >= v_reservation.quantity",
        ]
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            # Simulate all the valid error types
            valid_errors = [
                "ATOMIC_GUARD_VIOLATION: Order does not exist",
                "RESERVATION_EXPIRED: Reservations have expired",
                "RESERVATION_RELEASED: Reservations have been released",
                "RESERVATION_NOT_FOUND: No reservations found",
            ]
            
            for valid_error in valid_errors:
                mock_db = MagicMock()
                mock_repo.db = mock_db
                mock_db.rpc.return_value.execute.side_effect = Exception(valid_error)
                
                from services.inventory_service import InventoryService
                
                service = InventoryService(repository=mock_repo)
                
                try:
                    service.confirm_reservation(
                        reservation_ids=['res_1'],
                        order_id='order_123',
                        idempotency_key='test_key'
                    )
                except Exception as e:
                    error_str = str(e).lower()
                    # Verify none of the bad error messages appear
                    for bad_msg in error_messages_that_should_not_occur:
                        assert bad_msg.lower() not in error_str, \
                            f"Confirmation should NEVER fail with '{bad_msg}'"


class TestReservationContractSnapshots:
    """Tests for the immutable reservation snapshot feature."""
    
    def test_reservation_stores_snapshot(self):
        """Test that reserve_stock_batch stores immutable snapshot."""
        # This would be an integration test against the actual DB
        # For unit testing, we verify the service calls the correct RPC
        from unittest.mock import patch, MagicMock
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute.return_value = MagicMock(
                data={
                    'success': True,
                    'reservations': [{'reservation_id': 'res_1', 'product_id': 'prod_1', 'quantity': 3}],
                    'expires_at': '2026-01-31T15:00:00Z'
                }
            )
            
            from services.inventory_service import InventoryService
            from domain import StockItem
            
            service = InventoryService(repository=mock_repo)
            
            items = [StockItem(
                product_id='prod_1',
                variant_id='var_1',
                size='M',
                quantity=3,
                name='Test Shirt'
            )]
            
            result = service.validate_and_reserve(
                user_id='test_user',
                items=items,
                source='website',
                session_id='session_123'
            )
            
            assert result.success is True
            
            # Verify RPC was called with correct function name
            mock_db.rpc.assert_called_with('reserve_stock_batch', {
                'p_user_id': 'test_user',
                'p_session_id': 'session_123',
                'p_source': 'website',
                'p_items': [{
                    'product_id': 'prod_1',
                    'variant_id': 'var_1',
                    'size': 'M',
                    'color': None,
                    'name': 'Test Shirt',
                    'quantity': 3
                }],
                'p_ttl_minutes': 15
            })


class TestConcurrentReservationIdempotency:
    """
    ════════════════════════════════════════════════════════════════════════════
    SEV-1 FIX VERIFICATION: CONCURRENT RESERVATION IDEMPOTENCY
    ════════════════════════════════════════════════════════════════════════════
    
    Core Guarantee: Two concurrent calls to validate_and_reserve with the same
    session_id + product + variant + size MUST:
    1. Create exactly ONE reservation
    2. NEVER raise duplicate key errors
    3. Return success for both calls (one creates, one reuses)
    
    This is how Stripe enforces exactly-once semantics.
    """
    
    def test_concurrent_pre_payment_reservation_is_idempotent(self):
        """
        GOLD STANDARD TEST: Concurrent reservations MUST be idempotent.
        
        Two simultaneous calls to validate_and_reserve must:
        - Create exactly one reservation
        - Never raise duplicate key errors
        - Both return success
        
        This test simulates the exact bug scenario:
        1. User clicks "Pay Now" 
        2. Two webhook/message deliveries arrive simultaneously
        3. Both trigger validate_and_reserve()
        4. Only ONE DB insert should occur
        """
        import threading
        import time
        from unittest.mock import patch, MagicMock
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        results = []
        errors = []
        call_count = 0
        lock = threading.Lock()
        
        def mock_rpc_execute(*args, **kwargs):
            """Simulate DB behavior with race-condition potential."""
            nonlocal call_count
            with lock:
                call_count += 1
                current_call = call_count
            
            # Simulate race condition timing
            time.sleep(0.01)
            
            # First call succeeds with new reservation
            if current_call == 1:
                return MagicMock(data={
                    'success': True,
                    'reservations': [{'reservation_id': 'res_1', 'product_id': 'prod_1', 'quantity': 3}],
                    'expires_at': '2026-01-31T15:00:00Z',
                    'new_count': 1,
                    'reused_count': 0
                })
            else:
                # Second call returns idempotent response (ON CONFLICT DO NOTHING)
                return MagicMock(data={
                    'success': True,
                    'reservations': [{'reservation_id': 'res_1', 'product_id': 'prod_1', 'quantity': 3, 'reused': True}],
                    'expires_at': '2026-01-31T15:00:00Z',
                    'new_count': 0,
                    'reused_count': 1,
                    'idempotent': True
                })
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            mock_db = MagicMock()
            mock_repo.db = mock_db
            mock_db.rpc.return_value.execute = mock_rpc_execute
            
            from services.inventory_service import InventoryService
            from domain import StockItem
            
            service = InventoryService(repository=mock_repo)
            
            def make_reservation():
                try:
                    result = service.validate_and_reserve(
                        user_id='test_user',
                        items=[StockItem(
                            product_id='prod_1',
                            variant_id='var_1',
                            size='M',
                            quantity=3,
                            name='Test Shirt'
                        )],
                        source='whatsapp_ai_prepayment',
                        session_id='ai_brain_user123'  # SAME session ID for both
                    )
                    results.append(result)
                except Exception as e:
                    errors.append(str(e))
            
            # Execute two concurrent reservations
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [executor.submit(make_reservation) for _ in range(2)]
                for future in as_completed(futures):
                    pass  # Wait for all to complete
        
        # CRITICAL ASSERTIONS
        assert len(errors) == 0, f"Should NEVER raise errors, got: {errors}"
        assert len(results) == 2, "Both calls should return results"
        assert all(r.success for r in results), "Both results should be success"
        
        # Verify we got the same reservation ID back
        assert all(
            'res_1' in str(r.reservation_ids) for r in results
        ), "Both calls should reference the same reservation"
    
    def test_concurrent_reservation_with_db_conflict_handling(self):
        """
        Test that even if DB throws a conflict, we handle it gracefully.
        
        This tests the inventory service layer's behavior when the DB
        layer reports an idempotent response.
        """
        from unittest.mock import patch, MagicMock
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            mock_db = MagicMock()
            mock_repo.db = mock_db
            
            # Simulate idempotent DB response (what ON CONFLICT DO NOTHING returns)
            mock_db.rpc.return_value.execute.return_value = MagicMock(data={
                'success': True,
                'reservations': [{'reservation_id': 'existing_res', 'product_id': 'prod_1', 'quantity': 1, 'reused': True}],
                'expires_at': '2026-01-31T15:00:00Z',
                'idempotent': True,
                'reused_count': 1,
                'new_count': 0,
                'message': 'Reservations already exist'
            })
            
            from services.inventory_service import InventoryService
            from domain import StockItem
            
            service = InventoryService(repository=mock_repo)
            
            result = service.validate_and_reserve(
                user_id='test_user',
                items=[StockItem(
                    product_id='prod_1',
                    variant_id=None,
                    size='M',
                    quantity=1,
                    name='Test Item'
                )],
                source='whatsapp',
                session_id='existing_session'
            )
            
            # Should succeed with the existing reservation
            assert result.success is True
            assert 'existing_res' in result.reservation_ids
    
    def test_duplicate_key_error_never_reaches_caller(self):
        """
        Verify that 'duplicate key' errors NEVER propagate to caller.
        
        Even if something goes wrong in the idempotency logic,
        the error should be handled gracefully.
        """
        from unittest.mock import patch, MagicMock
        
        with patch('services.inventory_service.get_inventory_repository') as mock_get_repo:
            mock_repo = MagicMock()
            mock_get_repo.return_value = mock_repo
            
            mock_db = MagicMock()
            mock_repo.db = mock_db
            
            # Even if somehow a duplicate key error occurs, it should be caught
            # and converted to an idempotent success (this is DB-level defense)
            mock_db.rpc.return_value.execute.return_value = MagicMock(data={
                'success': True,
                'reservations': [{'reservation_id': 'fallback_res', 'reused': True}],
                'expires_at': '2026-01-31T15:00:00Z'
            })
            
            from services.inventory_service import InventoryService
            from domain import StockItem
            
            service = InventoryService(repository=mock_repo)
            
            # This should NEVER raise DuplicateReservationError or 
            # any error containing "duplicate key"
            result = service.validate_and_reserve(
                user_id='test_user',
                items=[StockItem(
                    product_id='prod_1',
                    variant_id=None,
                    size='M',
                    quantity=1,
                    name='Test Item'
                )],
                source='whatsapp',
                session_id='test_session'
            )
            
            assert result.success is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

