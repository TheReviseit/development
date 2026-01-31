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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
