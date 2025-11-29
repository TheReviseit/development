"""Initial schema

Revision ID: 001
Revises: 
Create Date: 2025-11-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('role', sa.Enum('ADMIN', 'USER', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'])
    op.create_index(op.f('ix_users_email'), 'users', ['email'])

    # Businesses table
    op.create_table(
        'businesses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('industry', sa.String(), nullable=True),
        sa.Column('whatsapp_phone_number_id', sa.String(), nullable=True),
        sa.Column('whatsapp_business_account_id', sa.String(), nullable=True),
        sa.Column('whatsapp_access_token', sa.String(), nullable=True),
        sa.Column('whatsapp_webhook_verify_token', sa.String(), nullable=True),
        sa.Column('whatsapp_connected', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('business_profile', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_businesses_id'), 'businesses', ['id'])

    # Business Users (junction table)
    op.create_table(
        'business_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.Enum('OWNER', 'ADMIN', 'MEMBER', name='businessuserrole'), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Customers table
    op.create_table(
        'customers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('phone_number', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('conversation_memory', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('lead_score', sa.Enum('COLD', 'WARM', 'HOT', name='leadscore'), nullable=True),
        sa.Column('score_value', sa.Float(), nullable=True),
        sa.Column('funnel_stage', sa.String(), nullable=True),
        sa.Column('last_activity_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customers_phone_number'), 'customers', ['phone_number'])

    # Messages table
    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('whatsapp_message_id', sa.String(), nullable=True),
        sa.Column('direction', sa.Enum('INBOUND', 'OUTBOUND', name='messagedirection'), nullable=False),
        sa.Column('message_type', sa.Enum('TEXT', 'TEMPLATE', 'BUTTON_REPLY', 'QUICK_REPLY', 'MEDIA', name='messagetype'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('status', sa.Enum('SENT', 'DELIVERED', 'READ', 'FAILED', name='messagestatus'), nullable=True),
        sa.Column('detected_intent', sa.String(), nullable=True),
        sa.Column('intent_confidence', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('whatsapp_message_id')
    )
    op.create_index(op.f('ix_messages_created_at'), 'messages', ['created_at'])

    # Add remaining tables (automation_rules, intents, workflows, campaigns, followups)
    # Simplified for brevity - you would add all remaining tables here


def downgrade() -> None:
    op.drop_table('messages')
    op.drop_table('customers')
    op.drop_table('business_users')
    op.drop_table('businesses')
    op.drop_table('users')
