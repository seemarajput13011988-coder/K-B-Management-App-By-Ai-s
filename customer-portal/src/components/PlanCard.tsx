import { ArrowRight, CheckCircle2, Clock3, Database, Gauge, Sparkles, Wifi } from 'lucide-react';
import { money } from '../data/catalog';
import type { Plan } from '../data/catalog';

type Props = {
  plan: Plan;
  onSelect: (plan: Plan) => void;
};

export default function PlanCard({ plan, onSelect }: Props) {
  return (
    <article className={'plan-card kb-plan-card ' + plan.color + (plan.featured ? ' is-featured' : '')}>
      <div className="kb-plan-card-top">
        <span className="kb-plan-brand"><Wifi size={14} /> K&B FIBRE</span>
        <div className="kb-plan-labels">
          {plan.featured && <span className="kb-plan-featured-label">MOST POPULAR</span>}
          {plan.tag && <span className="kb-plan-tag-label">{plan.tag}</span>}
          {plan.offerLabel && <span className="kb-plan-offer-label"><Sparkles size={12} /> {plan.offerLabel}</span>}
        </div>
      </div>

      <div className="kb-plan-name-block">
        <h3>{plan.name}</h3>
        <p>{plan.tagline || 'Reliable broadband for your connected home.'}</p>
      </div>

      <div className="kb-plan-price-block">
        <span className="kb-price-caption">MONTHLY PLAN PRICE</span>
        <div>
          <strong>{money(plan.price)}</strong>
          <span>/ {plan.validity}</span>
        </div>
        <small>GST extra · Final charges confirmed before booking</small>
      </div>

      <div className="kb-plan-specs">
        <div className="kb-plan-speed">
          <span><Gauge size={14} /> SPEED</span>
          <b>{plan.speed}</b>
        </div>
        <div className="kb-plan-data">
          <span><Database size={14} /> MONTHLY DATA</span>
          <b>{plan.data}</b>
        </div>
        <div className="kb-plan-validity">
          <span><Clock3 size={13} /> PLAN VALIDITY</span>
          <b>{plan.validity}</b>
        </div>
      </div>

      {plan.idealFor && (
        <div className="kb-plan-ideal">
          <span>IDEAL FOR</span>
          <b>{plan.idealFor}</b>
        </div>
      )}

      {plan.features.length > 0 && (
        <div className="kb-plan-benefits">
          <span className="kb-plan-benefits-title">PLAN HIGHLIGHTS</span>
          {plan.features.map((feature, index) => (
            <div key={plan.id + '-feature-' + index}>
              <CheckCircle2 size={15} />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      )}

      <button className="plan-button kb-plan-select" onClick={() => onSelect(plan)}>
        Choose this plan <ArrowRight size={17} />
      </button>
      <span className="kb-plan-footnote">Availability and fair-use terms apply</span>
    </article>
  );
}
